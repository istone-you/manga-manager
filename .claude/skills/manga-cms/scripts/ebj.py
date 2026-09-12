"""ebookjapan から巻一覧・表紙URL・完結状態を取得する。

作品ページは Nuxt 3 で、HTML 内の <script id="__NUXT_DATA__"> に
flat JSON payload が埋まっている。そこから必要な値を拾う。

CLI:
  python3 ebj.py volumes <seriesId>          巻番号 -> publicationCd の一覧
  python3 ebj.py cover   <seriesId> <巻数>    その巻の表紙URL
  python3 ebj.py covers  <seriesId> <巻数..>  複数巻の表紙URLをJSONで
  python3 ebj.py status  <seriesId>          最新巻と完結フラグ
"""

import json
import re
import subprocess
import sys
import time

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
BASE = "https://ebookjapan.yahoo.co.jp"

# 巻一覧から除外する版(通常の単行本だけを残す)
EXCLUDE_KEYWORDS = ("期間限定", "無料", "特装", "分冊", "話売")


def fetch(url):
    r = subprocess.run(
        ["curl", "-sS", "-H", f"User-Agent: {UA}", "--compressed", url],
        capture_output=True,
        text=True,
    )
    return r.stdout


def payload(html):
    """__NUXT_DATA__ の flat payload を返す。値は配列インデックス参照になっている。"""
    m = re.search(r'id="__NUXT_DATA__">(.*?)</script>', html, re.S)
    return json.loads(m.group(1)) if m else None


def _deref(data, value):
    """payload 内のインデックス参照を実体に解決する。"""
    return data[value] if isinstance(value, int) and 0 <= value < len(data) else value


def series_info(series):
    """シリーズページ -> (最新巻の publicationCd, 最新巻数, 作品名)

    シリーズページの payload には publicationCd を持つオブジェクトが多数あるが、
    先頭2件がその作品の「1巻」と「最新巻」。3件目以降はレコメンド枠の別作品。
    """
    d = payload(fetch(f"{BASE}/books/{series}/"))
    if d is None:
        return None
    found = []
    for x in d:
        if isinstance(x, dict) and "publicationCd" in x and "name" in x:
            found.append((_deref(d, x["publicationCd"]), _deref(d, x["name"])))
        if len(found) >= 2:
            break
    if not found:
        return None
    cd, name = found[-1]
    m = re.search(r"[（(]\s*([0-9]+)\s*[）)]\s*$", name)
    return cd, (int(m.group(1)) if m else None), name


def volumes_from_volpage(html):
    """巻ページ -> {巻タイトル: (巻番号, publicationCd)}

    任意の1巻のページに、そのシリーズ全巻の情報が入っている。
    """
    d = payload(html)
    if d is None:
        return {}
    out = {}
    for x in d:
        if isinstance(x, dict) and {"publicationCd", "volumeName", "name"} <= x.keys():
            cd = _deref(d, x["publicationCd"])
            vn = _deref(d, x["volumeName"])
            nm = _deref(d, x["name"])
            if not isinstance(cd, str) or not isinstance(nm, str):
                continue
            if not re.fullmatch(r"[0-9]+", str(vn or "")):
                continue
            out.setdefault(nm, (int(vn), cd))
    return out


def all_volumes(series, exclude=EXCLUDE_KEYWORDS):
    """シリーズの {巻番号: publicationCd} と作品名を返す。"""
    info = series_info(series)
    if not info:
        return {}, None
    latest_cd, _, name = info
    base = re.sub(r"[（(]\s*[0-9]+\s*[）)]\s*$", "", name).strip()
    vols = {}
    for nm, (vn, cd) in volumes_from_volpage(
        fetch(f"{BASE}/books/{series}/{latest_cd}/")
    ).items():
        if any(k in nm for k in exclude):
            continue
        vols[vn] = cd
    return vols, base


def cover_of(series, publication_cd):
    """巻ページ -> (表紙URL, ページタイトル)

    一覧ページの画像は遅延ロードでプレースホルダしか出ないが、
    巻の個別ページには実URLがちょうど1件だけ現れる。
    タイトルで巻数を照合できるので必ず確認すること。
    """
    html = fetch(f"{BASE}/books/{series}/{publication_cd}/")
    m = re.search(
        r"(https://cache2-ebookjapan\.akamaized\.net/contents/thumb/[a-z]/[A-Z0-9]+\.jpg\?[0-9]+)",
        html,
    )
    t = re.search(r"<title>([^<]*)", html)
    return (m.group(1) if m else None), (t.group(1).strip() if t else "")


def series_complete(series):
    """(完結か, 最新巻数, 最新巻名) — 最新巻の isLastVolume で判定。

    注意: これは「刊行済み単行本が最終巻か」であって連載状態ではない。
    連載が終わっていても最終巻が未刊なら False になる(SKILL.md 参照)。
    """
    info = series_info(series)
    if not info:
        return None
    latest_cd, latest_no, _ = info
    d = payload(fetch(f"{BASE}/books/{series}/{latest_cd}/"))
    if d is None:
        return None
    idx = {x: i for i, x in enumerate(d) if isinstance(x, str)}
    tgt = idx.get(latest_cd)
    for x in d:
        if isinstance(x, dict) and x.get("publicationCd") == tgt:
            return (
                bool(_deref(d, x.get("isLastVolume"))),
                latest_no,
                _deref(d, x.get("name")),
            )
    return None


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 1
    cmd, series = argv[1], argv[2]

    if cmd == "volumes":
        vols, base = all_volumes(series)
        print(f"# {base} / 実在 {max(vols) if vols else 0} 巻")
        for v in sorted(vols):
            print(f"{v:4d}  {vols[v]}")

    elif cmd == "status":
        r = series_complete(series)
        print(json.dumps({"complete": r[0], "latest": r[1], "latest_name": r[2]}, ensure_ascii=False))

    elif cmd in ("cover", "covers"):
        vols, _ = all_volumes(series)
        out = {}
        for arg in argv[3:]:
            n = int(arg)
            if n not in vols:
                out[n] = {"url": None, "title": None, "note": "未発売または未収録"}
                continue
            url, title = cover_of(series, vols[n])
            out[n] = {"url": url, "title": title.split(" (")[0]}
            time.sleep(0.15)
        print(json.dumps(out, ensure_ascii=False, indent=1))

    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
