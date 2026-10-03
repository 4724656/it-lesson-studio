import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

// 加载项目 Master Skill 作为大模型核心系统提示词
function loadSystemPrompt() {
  const skillPath = path.join(rootDir, 'skills', 'it-lesson-studio', 'SKILL.md');
  if (fs.existsSync(skillPath)) {
    return fs.readFileSync(skillPath, 'utf-8');
  }
  return '你是一位中小学信息科技特级教师，擅长设计教案、导学单、课件和随堂作业。';
}

/**
 * 调用 LLM API 生成四位一体教学资料
 */
export async function generateLessonFiles({ taskId, grade, lessonTitle, requirements, targetDir }) {
  const apiBase = process.env.AI_API_BASE || 'http://127.0.0.1:8317/v1';
  const apiKey = process.env.AI_API_KEY || 'sk-none';
  const model = process.env.AI_MODEL || 'gemini-2.5-flash';

  const systemPrompt = loadSystemPrompt();

  const userPrompt = `
请为以下中小学信息科技课程设计全套【四位一体】教学资源：
- 授课年级：${grade}
- 课程课题：${lessonTitle}
- 教师补充要求 / 教学意图：${requirements || '无特殊补充，请严格紧扣浙教版 2026 最新教材体系与 2022 义务教育信息科技新课标。'}

【输出格式强制要求】：
必须严格按照以下四个文件标记完整输出，严禁省略，保证四位一体任务同源呼应：

===FILE: 教案.md===
(严格遵循教案规范，<=4页A4，无板书，含生活通俗比喻、设问话术、避坑锦囊三支架，四列精排教学过程表)

===FILE: 导学案.md===
(严格遵循导学单规范，低段单面A4，第一人称趣味语境，含显式 [ ] 勾选槽与微型记录表，无学术套话)

===FILE: 课件.md===
(Marp 16:9 主题 edu-lesson，卡片式网格布局，纯净学生第一视角，绝无教师后台台词)

===FILE: 课堂作业.html===
(100% 纯原生单文件离线断网零依赖，3~4年级<=4屏，含磁吸/微解剖台/预演交互、统一批改测验、徽章、自评与导出凭单)
`;

  // 发起 API 请求
  const endpoint = `${apiBase.replace(/\/+$/, '')}/chat/completions`;
  
  const payload = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI 服务请求失败 [HTTP ${response.status}]: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  if (!content) {
    throw new Error('AI 未返回有效内容');
  }

  // 解析并落盘四个文件
  const files = parseDelimitedFiles(content, lessonTitle);
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  for (const [filename, fileContent] of Object.entries(files)) {
    const filePath = path.join(targetDir, filename);
    fs.writeFileSync(filePath, fileContent.trim(), 'utf-8');
  }

  return Object.keys(files);
}

/**
 * 解析大模型返回的带有 ===FILE: xxx=== 标记的文本
 */
function parseDelimitedFiles(rawText, lessonTitle) {
  const cleanTitle = lessonTitle.replace(/[\\/:*?"<>|]/g, '_').trim();
  const fileRegex = /===FILE:\s*([^\n\r=]+)===\s*([\s\S]*?)(?====FILE:|$)/g;
  const result = {};
  let match;

  while ((match = fileRegex.exec(rawText)) !== null) {
    const rawName = match[1].trim();
    const content = match[2].trim();

    // 格式化标准化文件名
    let standardName = rawName;
    if (rawName.includes('教案')) {
      standardName = `${cleanTitle}_教案.md`;
    } else if (rawName.includes('导学')) {
      standardName = `${cleanTitle}_导学案.md`;
    } else if (rawName.includes('课件')) {
      standardName = `${cleanTitle}_课件.md`;
    } else if (rawName.includes('作业')) {
      standardName = `${cleanTitle}_课堂作业.html`;
    }

    result[standardName] = content;
  }

  // 兜底检查：如果大模型没有正确遵循 ===FILE: 标记，则抛出明确错误提示
  if (Object.keys(result).length === 0) {
    throw new Error('大模型未按规范输出四份资料文件标记，请重试');
  }

  return result;
}
