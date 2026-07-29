#!/usr/bin/env python3
"""Convert SHarD security framework report from Markdown to self-contained HTML."""

import re
import json
import markdown
import os

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def preprocess_latex(md_text):
    """Escape LaTeX code blocks so markdown processor doesn't mangle them."""
    lines = md_text.split('\n')
    processed = []
    in_latex_block = False
    for line in lines:
        if line.strip().startswith('$$') and not in_latex_block:
            processed.append(line)
            in_latex_block = True
            continue
        if line.strip() == '$$' and in_latex_block:
            processed.append(line)
            in_latex_block = False
            continue
        # Escape underscores in LaTeX inline math within code blocks
        processed.append(line)
    return '\n'.join(processed)

def convert_md_to_html(md_text):
    """Convert markdown to HTML using Python-Markdown with extensions."""
    extensions = [
        'markdown.extensions.fenced_code',
        'markdown.extensions.codehilite',
        'markdown.extensions.tables',
        'markdown.extensions.nl2br',
        'markdown.extensions.sane_lists',
    ]
    # Enable codehilite without pygments for inline CSS
    html = markdown.markdown(md_text, extensions=extensions)
    return html

def wrap_with_template(content_html, title):
    """Wrap the HTML content in a full page template."""
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" crossorigin="anonymous"
    onload="renderMathInElement(document.body, {{delimiters:[
        {{left: '$$', right: '$$', display: true}},
        {{left: '$', right: '$', display: false}}
    ]}});"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script>hljs.highlightAll();</script>
<style>
/* ====== Reset & Base ====== */
*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
html {{ font-size: 16px; -webkit-font-smoothing: antialiased; }}
body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Noto Sans", Roboto, "Helvetica Neue", sans-serif;
    line-height: 1.75;
    color: #1a1a2e;
    background: #f8f9fa;
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
}}

/* ====== Typography ====== */
h1 {{ font-size: 2.2rem; margin: 1.5rem 0 0.8rem; border-bottom: 3px solid #2563eb; padding-bottom: 0.4rem; color: #0f172a; }}
h2 {{ font-size: 1.6rem; margin: 2rem 0 0.6rem; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3rem; }}
h3 {{ font-size: 1.25rem; margin: 1.5rem 0 0.5rem; color: #334155; }}
h4 {{ font-size: 1.1rem; margin: 1.2rem 0 0.4rem; color: #475569; }}
p {{ margin: 0.8rem 0; }}
strong {{ color: #0f172a; }}
a {{ color: #2563eb; text-decoration: none; }}
a:hover {{ text-decoration: underline; }}

/* ====== Lists ====== */
ul, ol {{ margin: 0.6rem 0 0.6rem 1.5rem; }}
li {{ margin: 0.3rem 0; }}

/* ====== Code ====== */
code {{
    font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace;
    font-size: 0.88em;
    background: #eef2ff;
    padding: 0.2em 0.4em;
    border-radius: 4px;
    color: #1e40af;
}}
pre {{
    background: #0d1117;
    color: #e6edf3;
    border-radius: 8px;
    padding: 1rem 1.2rem;
    overflow-x: auto;
    margin: 1rem 0;
    font-size: 0.88rem;
    line-height: 1.5;
    border: 1px solid #30363d;
}}
pre code {{
    background: transparent;
    color: inherit;
    padding: 0;
    border-radius: 0;
}}

/* ====== Blockquotes ====== */
blockquote {{
    border-left: 4px solid #2563eb;
    padding: 0.6rem 1rem;
    margin: 1rem 0;
    background: #f0f4ff;
    border-radius: 0 6px 6px 0;
    color: #1e293b;
}}

/* ====== Tables ====== */
table {{
    width: 100%;
    border-collapse: collapse;
    margin: 1.2rem 0;
    font-size: 0.92rem;
}}
thead {{
    background: #1e293b;
    color: #f8fafc;
}}
th, td {{
    padding: 0.6rem 0.8rem;
    text-align: left;
    border: 1px solid #d1d5db;
}}
tbody tr:nth-child(even) {{ background: #f1f5f9; }}
tbody tr:hover {{ background: #e2e8f0; }}

/* ====== Horizontal Rules ====== */
hr {{
    border: none;
    border-top: 2px solid #d1d5db;
    margin: 2rem 0;
}}

/* ====== Disclaimer Banner ====== */
.disclaimer {{
    background: #fef3c7;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    padding: 1rem 1.2rem;
    margin-bottom: 2rem;
    font-size: 0.85rem;
    color: #78350f;
    line-height: 1.6;
}}
.disclaimer strong {{ color: #92400e; }}

/* ====== Author Info ====== */
.author-info {{
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0 1.5rem;
    color: #64748b;
    font-size: 0.95rem;
}}
.author-info .separator {{ color: #94a3b8; }}

/* ====== KaTeX fixes ====== */
.katex-display {{ margin: 1rem 0; overflow-x: auto; overflow-y: hidden; }}
.katex {{ font-size: 1.1em; }}

/* ====== Responsive ====== */
@media (max-width: 640px) {{
    body {{ padding: 1rem; font-size: 0.95rem; }}
    h1 {{ font-size: 1.6rem; }}
    h2 {{ font-size: 1.3rem; }}
    table {{ font-size: 0.82rem; }}
    th, td {{ padding: 0.4rem 0.5rem; }}
}}
</style>
</head>
<body>

<div class="disclaimer">
<strong>ⓘ Disclaimer:</strong> This report is provided for informational and research purposes only. It represents the author's analysis and interpretation of the SHarD security framework concept as of the publication date. The content does not constitute professional security advice, nor does it guarantee the effectiveness of any referenced methodology in any specific deployment. The author and RebornClaw Technology Co., Ltd. disclaim any liability for losses or damages arising from the use or reliance on the information contained herein. Readers should consult qualified professionals for security architecture decisions.
</div>

<div class="author-info">
<span>Martin Chien</span>
<span class="separator">|</span>
<span>RebornClaw Technology Co., Ltd.</span>
<span class="separator">|</span>
<span>2026-07-30</span>
</div>

{content_html}

<script>
// Re-render KaTeX after highlight.js has run
document.addEventListener("DOMContentLoaded", function() {{
    if (typeof renderMathInElement !== 'undefined') {{
        renderMathInElement(document.body, {{
            delimiters: [
                {{left: '$$', right: '$$', display: true}},
                {{left: '$', right: '$', display: false}}
            ]
        }});
    }}
}});
</script>
</body>
</html>'''

def main():
    input_path = r"D:\rebornclaw\research\published\reports\2026-07\shard-security-framework\full-report.md"
    output_path = r"D:\rebornclaw\research\published\reports\2026-07\shard-security-framework\full-report.html"
    
    print(f"Reading: {input_path}")
    md_text = read_file(input_path)
    
    # Preprocess: fix Python code blocks that are missing proper formatting
    # The markdown has some code blocks that need proper fence markers
    # Fix the dataclass code block - it has typing import without space
    md_text = md_text.replace("from dataclasses import dataclass, fieldfrom typing import List, Dict, Any, Optionalimport time", 
                              "from dataclasses import dataclass, field\nfrom typing import List, Dict, Any, Optional\nimport time")
    
    print("Converting Markdown to HTML...")
    content_html = convert_md_to_html(md_text)
    
    print("Wrapping with template...")
    full_html = wrap_with_template(content_html, "SHarD 安全框架深度分析 | RebornClaw Research")
    
    print(f"Writing: {output_path}")
    write_file(output_path, full_html)
    
    print("Done! HTML file generated successfully.")
    
    # Report file size
    size_kb = os.path.getsize(output_path) / 1024
    print(f"Output size: {size_kb:.1f} KB")

if __name__ == "__main__":
    main()