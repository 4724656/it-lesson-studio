#!/usr/bin/env python3
"""check_lesson.py P0-3 textbook_id 图谱核对回归测试。

验证：
1. 图谱中 12 个册次的 Textbook ID 能被正确解析；
2. 三年级第02课 lesson.yaml 的 textbook_id 与图谱一致，check_manifest 0 FAIL；
3. 篡改 textbook_id 后 check_manifest 报 FAIL（P0-3）。

运行：uv run python tests/test_check_manifest_textbook_id.py
"""
import os
import sys
import shutil
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import check_lesson

REPO = os.path.join(os.path.dirname(__file__), "..")
GRADE3_LESSON = os.path.join(REPO, "examples", "三年级上", "第02课_了解智能工具")


def test_textbook_ids_parsed():
    """12 个册次的 Textbook ID 应全部解析出来."""
    check_lesson.load_textbook_graph()
    ids = check_lesson._TEXTBOOK_IDS
    assert len(ids) == 12, f"应解析出 12 个册次 ID，实际 {len(ids)}"
    assert ids[(3, "上")] == "1000067", f"三年级上册 ID 应为 1000067，实际 {ids.get((3, '上'))}"
    print("  [OK] 图谱 Textbook ID 解析：12 个册次，三年级上=1000067")


def test_grade3_lesson02_textbook_id_passes():
    """三年级第02课课次身份（textbook_id + 图谱对齐）机器验证通过."""
    fails, warns = check_lesson.check_manifest(GRADE3_LESSON)
    assert fails == 0, f"三年级第02课 Manifest 应 0 FAIL，实际 {fails}"
    print("  [OK] 三年级第02课 textbook_id=1000067 与图谱一致，0 FAIL")


def test_textbook_id_mismatch_fails():
    """篡改 textbook_id 后必须 FAIL（P0-3）."""
    tmp = tempfile.mkdtemp(prefix="tid-mismatch-")
    try:
        lesson_dir = os.path.join(tmp, "lesson")
        shutil.copytree(GRADE3_LESSON, lesson_dir)
        yaml_path = os.path.join(lesson_dir, "lesson.yaml")
        src = open(yaml_path, encoding="utf-8").read()
        assert 'textbook_id: "1000067"' in src
        open(yaml_path, "w", encoding="utf-8").write(
            src.replace('textbook_id: "1000067"', 'textbook_id: "9999999"'))
        # 清掉模块级图谱缓存，避免跨用例污染
        check_lesson._GRAPH = None
        check_lesson._TEXTBOOK_IDS = None
        fails, _ = check_lesson.check_manifest(lesson_dir)
        assert fails >= 1, "textbook_id 篡改后应至少 1 个 FAIL"
        print("  [OK] textbook_id 不一致 → FAIL（P0-3 生效）")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        check_lesson._GRAPH = None
        check_lesson._TEXTBOOK_IDS = None


if __name__ == "__main__":
    test_textbook_ids_parsed()
    test_grade3_lesson02_textbook_id_passes()
    test_textbook_id_mismatch_fails()
    print("textbook_id 回归测试全部通过")
