"""Run with uv run python tests/test_html_completeness.py."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from check_lesson import html_completeness_errors

html = '<!DOCTYPE html><html><head><style>body { color: red; }</style></head><body><section></section><script>const x="<section>";</script></body></html>'
assert html_completeness_errors(html) == []
for tag in ('html', 'head', 'body', 'script', 'style', 'section'):
    assert html_completeness_errors(html.replace('</' + tag + '>', ''))
assert html_completeness_errors('<!-- ' + html + ' -->')
assert html_completeness_errors(html + '<html>')
print('HTML completeness regression checks passed')

from check_lesson import count_quiz_questions, quiz_stems
sample = 'const quiz = [{"q":"一个问题？","options":["A","B"],"correct":0,"why":"解释"}];'
assert count_quiz_questions(sample) == 1
assert quiz_stems(sample) == ['一个问题？']
print('JSON quiz counting regression checks passed')
