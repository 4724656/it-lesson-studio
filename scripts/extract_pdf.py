"""
PDF 课标/教材文档文本抽取与瘦身脚本
用法:
    uv run --with pypdf python scripts/extract_pdf.py <input.pdf> [output.txt/md]
"""

import sys
import re
from pathlib import Path

def extract_pdf_to_clean_text(pdf_path: str, output_path: str = None) -> str:
    pdf_file = Path(pdf_path)
    if not pdf_file.exists():
        print(f"错误: 找不到文件 {pdf_file}")
        sys.exit(1)

    try:
        from pypdf import PdfReader
    except ImportError:
        print("请使用 uv 运行: uv run --with pypdf python scripts/extract_pdf.py <input.pdf>")
        sys.exit(1)

    print(f"正在读取并解析: {pdf_file.name} ...")
    reader = PdfReader(str(pdf_file))
    total_pages = len(reader.pages)
    print(f"总页数: {total_pages} 页")

    extracted_pages = []
    for idx, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        
        # 清洗页眉页脚常见噪声（例如纯页码、重复书名）
        lines = [line.strip() for line in text.splitlines()]
        cleaned_lines = []
        for line in lines:
            # 过滤纯数字页码，如 "12" 或 "· 12 ·" 或 "- 12 -"
            if re.match(r"^[\s·\-—]*\d+[\s·\-—]*$", line):
                continue
            if line:
                cleaned_lines.append(line)
        
        page_content = "\n".join(cleaned_lines)
        if page_content:
            extracted_pages.append(f"<!-- Page {idx} -->\n" + page_content)

    full_text = "\n\n".join(extracted_pages)

    if not output_path:
        output_file = pdf_file.with_suffix(".md")
    else:
        output_file = Path(output_path)

    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(full_text, encoding="utf-8")

    size_kb = output_file.stat().st_size / 1024
    print(f"✅ 转换完成！已保存至: {output_file}")
    print(f"体积瘦身: 原始 PDF -> {size_kb:.1f} KB 纯文本/Markdown")
    return str(output_file)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: uv run --with pypdf python scripts/extract_pdf.py <input.pdf> [output.txt/md]")
        sys.exit(1)

    pdf_in = sys.argv[1]
    out_file = sys.argv[2] if len(sys.argv) > 2 else None
    extract_pdf_to_clean_text(pdf_in, out_file)