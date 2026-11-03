import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { generateLessonFiles } from '../web/services/ai.js';
import { dbService } from '../web/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const lessons = [
  {
    gradeNum: 3,
    grade: '三年级上册',
    lessonTitle: '第02课 了解智能工具',
    targetExampleDir: path.join(rootDir, 'examples', '三年级上', '第02课_了解智能工具'),
    fileMap: {
      plan: '02_了解智能工具_教案.md',
      worksheet: '02_了解智能工具_导学案.md',
      slides: '02_了解智能工具_课件.md',
      classwork: '02_了解智能工具_课堂作业.html'
    },
    requirements: `本课为浙教版2026新课标小学三年级上册第一单元第2课《了解智能工具》。
三大核心探究任务名称必须严格同源固定为：
任务一：火眼金睛辨工具
任务二：机箱微型解剖台
任务三：键鼠练兵
请务必在教案、导学单、课件、课堂作业四个文件中100%同名同源呼应，贯穿始终！
【学情与语言风格】：
三年级学生刚接触电脑，严禁出现任何抽象编程代码、二极管、底层参数或大学生专业术语！
全量采用儿童化生活拟人比喻（如CPU是电脑的大脑、主板是各器官的桥梁、硬盘是存东西的仓库、鼠标双击像小啄木鸟轻敲）。
【课堂作业探究舱设计】：
严格 5 屏（data-step 0~4）：
第 0 屏：智能工具小剧场（火眼金睛辨工具，破冰认知日常生活中的智能处理工具）；
第 1 屏：机箱微型解剖台（动手实操屏 data-panel-type="hands-on"，点击主板、CPU、硬盘、风扇等部件高亮解剖并显示儿童化生活比喻卡片）；
第 2 屏：键鼠练兵（动手实操屏 data-panel-type="hands-on"，互动点击练习鼠标单击、双击小啄木鸟练习、主键盘区按键点亮）；
第 3 屏：生活工具大辨析（区分普通工具与智能工具）；
第 4 屏：终极关卡达标测验（严格 2 道单选题，题干<=30字，先选后判）+ 自我评价（必须包含“我还没完全懂，需要老师或同伴帮助”）+ 极简一键秒下学习凭单 (.txt，首行严格为 # 班级|姓名|第02课 了解智能工具|得分|时间）。彻底去除徽章与奖状。`
  },
  {
    gradeNum: 6,
    grade: '六年级上册',
    lessonTitle: '第05课 算法的执行',
    targetExampleDir: path.join(rootDir, 'examples', '六年级上', '第05课_算法的执行'),
    fileMap: {
      plan: '05_算法的执行_教案.md',
      worksheet: '05_算法的执行_导学案.md',
      slides: '05_算法的执行_课件.md',
      classwork: '05_算法的执行_课堂作业.html'
    },
    requirements: `本课为浙教版2026新课标小学六年级上册第一单元第5课《算法的执行》。
三大核心探究任务名称必须严格同源固定为：
任务一：算力引擎
任务二：代码排雷
任务三：逻辑再造
请务必在教案、导学单、课件、课堂作业四个文件中100%同名同源呼应，贯穿始终！
【学情与语言风格】：
六年级学生已经掌握基本程序概念与流程图，本课重在理解计算机执行算法的步骤、人肉CPU单步追踪与变量表变化，杜绝大学算法导论级枯燥推导，通俗生动，突出计算思维。
【课堂作业探究舱设计】：
严格 6 屏（data-step 0~5）：
第 0 屏：生活与算力破冰（算力引擎情境引入）；
第 1 屏：算力引擎（动手实操屏 data-panel-type="hands-on"，单步算法执行追踪器，点击“单步执行”观察指针下移、变量 x, y, count 实时同步变色刷新）；
第 2 屏：代码排雷（动手实操屏 data-panel-type="hands-on"，经典算法死循环/逻辑边界找错调试）；
第 3 屏：逻辑再造（动手实操屏 data-panel-type="hands-on"，条件分支与循环结构拼装重构 + ⭐进阶挑战星）；
第 4 屏：算法执行效率对比分析（比较不同执行路径的步数差异）；
第 5 屏：终极关卡达标测验（严格 3 道单选题，题干<=44字，先选后判）+ 自我评价（必须包含“我还没完全懂，需要老师或同伴帮助”）+ 极简一键秒下学习凭单 (.txt，首行严格为 # 班级|姓名|第05课 算法的执行|得分|时间）。彻底去除徽章与奖状。`
  },
  {
    gradeNum: 8,
    grade: '八年级上册',
    lessonTitle: '第12课 数据解密',
    targetExampleDir: path.join(rootDir, 'examples', '八年级上', '第12课_数据解密'),
    fileMap: {
      plan: '12_数据解密_教案.md',
      worksheet: '12_数据解密_导学案.md',
      slides: '12_数据解密_课件.md',
      classwork: '12_数据解密_课堂作业.html'
    },
    requirements: `本课为浙教版2026新课标初中八年级上册第三单元第12课《数据解密》。
三大核心探究任务名称必须严格同源固定为：
任务一：密钥探秘
任务二：变量追踪
任务三：逻辑排雷
请务必在教案、导学单、课件、课堂作业四个文件中100%同名同源呼应，贯穿始终！
【学情与语言风格】：
初中八年级学生具备较强抽象逻辑思维与网络安全意识，本课以凯撒密码移位解密、算法逆运算与我国商用密码安全性为主线，既有动手解密破译的趣味，又有信息安全责任感。
【课堂作业探究舱设计】：
严格 7 屏（data-step 0~6）：
第 0 屏：密信情报破冰引入（神秘密信）；
第 1 屏：密钥探秘（动手实操屏 data-panel-type="hands-on"，凯撒密码移位解密轮盘，拖动滑块调节密钥 Key=1~25，动态观察字母映射轮盘与密文实时解密）；
第 2 屏：变量追踪（动手实操屏 data-panel-type="hands-on"，单步追踪解密函数中 ord(), chr(), (c - key) % 26 变量变化）；
第 3 屏：逻辑排雷（动手实操屏 data-panel-type="hands-on"，修复一段有越界 bug 的解密代码表达式 + ⭐进阶挑战星）；
第 4 屏：暴力枚举破译实验（一键枚举 25 种密钥还原明文）；
第 5 屏：现代密码与我国自主密码技术发展普及（SM2/SM3/SM4）；
第 6 屏：终极关卡达标测验（严格 3 道单选题，题干<=54字，先选后判）+ 自我评价（必须包含“我还没完全懂，需要老师或同伴帮助”）+ 极简一键秒下学习凭单 (.txt，首行严格为 # 班级|姓名|第12课 数据解密|得分|时间）。彻底去除徽章与奖状。`
  }
];

async function run() {
  console.log('🚀 开始为 examples/ 目录下的三年级、六年级、八年级标杆课例生成最新教学产物...');

  const tempBase = path.join(rootDir, 'temp_examples_gen');
  if (fs.existsSync(tempBase)) {
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
  fs.mkdirSync(tempBase, { recursive: true });

  for (const item of lessons) {
    console.log(`\n============================================================`);
    console.log(`🎯 开始生成：${item.grade} · ${item.lessonTitle}`);
    console.log(`============================================================`);

    const tempDir = path.join(tempBase, `grade_${item.gradeNum}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const startTime = Date.now();
    await generateLessonFiles({
      taskId: `example-${item.gradeNum}`,
      grade: item.grade,
      lessonTitle: item.lessonTitle,
      requirements: item.requirements,
      targetDir: tempDir,
      onProgress: ({ progress, progressText }) => {
        console.log(`  [${progress}%] ${progressText}`);
      }
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ✔ 生成完毕 (耗时 ${elapsed}s)，开始落盘并映射到标杆课例目录...`);

    const genFiles = fs.readdirSync(tempDir);
    const planFile = genFiles.find(f => f.endsWith('教案.md'));
    const wsFile = genFiles.find(f => f.endsWith('导学案.md'));
    const slidesFile = genFiles.find(f => f.endsWith('课件.md'));
    const cwFile = genFiles.find(f => f.endsWith('课堂作业.html'));

    if (!planFile || !wsFile || !slidesFile || !cwFile) {
      throw new Error(`生成文件不完整：${genFiles.join(', ')}`);
    }

    fs.copyFileSync(path.join(tempDir, planFile), path.join(item.targetExampleDir, item.fileMap.plan));
    fs.copyFileSync(path.join(tempDir, wsFile), path.join(item.targetExampleDir, item.fileMap.worksheet));
    fs.copyFileSync(path.join(tempDir, slidesFile), path.join(item.targetExampleDir, item.fileMap.slides));
    fs.copyFileSync(path.join(tempDir, cwFile), path.join(item.targetExampleDir, item.fileMap.classwork));

    console.log(`  ✔ 已同步落盘到：${item.targetExampleDir}`);

    console.log(`  📦 正在编译导出 Word (教案/导学单) 与 PPTX/PDF (课件)...`);
    execFileSync('node', ['scripts/export-lesson.mjs', item.targetExampleDir], {
      cwd: rootDir,
      stdio: 'inherit'
    });

    console.log(`  🔍 正在运行合规门禁检查 check_lesson.py...`);
    execFileSync('uv', ['run', 'python', 'scripts/check_lesson.py', item.targetExampleDir], {
      cwd: rootDir,
      stdio: 'inherit'
    });
  }

  // 清理临时生成目录
  try {
    fs.rmSync(tempBase, { recursive: true, force: true });
  } catch {}

  console.log('\n============================================================');
  console.log('🎉 全部三套标杆课例生成、更新与导出成功！正在运行全局 examples/ 终检...');
  console.log('============================================================');

  execFileSync('uv', ['run', 'python', 'scripts/check_lesson.py', 'examples/'], {
    cwd: rootDir,
    stdio: 'inherit'
  });
}

run().catch(err => {
  console.error('\n❌ 任务执行失败:', err);
  process.exit(1);
});
