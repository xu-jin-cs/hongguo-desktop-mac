#!/usr/bin/env python3
"""guoapp signHongguoRequest 的 Python 移植验证（一次跑通即定稿 TS 版）"""
import hashlib, json, time, urllib.parse, urllib.request, random

XOR_KEY = bytes([0x44,0xb9,0xb9,0xd9,0xa4,0xae,0xf9,0xfc,0xa4,0x93,0xaa,0x75,0x7c,0xa3,0xc2,0xc4,0xa4,0x96,0x93,0x8f])

def rotl8(v, n):
    return ((v << n) | (v >> (8 - n))) & 0xff

def reverse8(v):
    r = 0
    for i in range(8):
        r |= ((v >> i) & 1) << (7 - i)
    return r

def sign(query_str: str, body: bytes, now: int):
    mq = hashlib.md5(query_str.encode()).digest()[:4]
    mb = hashlib.md5(body).digest()[:4] if body else bytes(4)
    payload = bytearray(20)
    payload[0:4] = mq
    payload[4:8] = mb
    # 8:12 零；12:16 = [0,6,11,28]
    payload[12] = 0; payload[13] = 6; payload[14] = 11; payload[15] = 28
    payload[16:20] = now.to_bytes(4, 'big')
    for i in range(20):
        payload[i] ^= XOR_KEY[i]
    # 就地变换（i=19 读到的是 i=0 已变换的值，guoapp/HGDJ 同语义）
    for i in range(20):
        payload[i] = reverse8(rotl8(payload[i], 4) ^ payload[(i + 1) % 20]) ^ 0xff ^ 20
    gorgon = '8404401c0000' + bytes(payload).hex()
    stub = hashlib.md5(body).hexdigest().upper() if body else None
    return gorgon, stub

UA = "com.phoenix.read/73532 (Linux; U; Android 16; zh_CN; 25053RT47C; Build/BP2A.250605.031.A3; Cronet/TTNetVersion:04657795 2026-01-23 QuicVersion:c67e9834 2025-09-08)"
BASE = "https://api5-normal-sinfonlineb.fqnovel.com"

def call(path, body_obj):
    now = int(time.time())
    q = {
        "aid": "8662", "app_name": "novelread", "version_code": "73532", "channel": "update_64",
        "device_type": "25053RT47C", "device_brand": "Redmi", "os_api": "36", "os_version": "16",
        "resolution": "1280*2772", "dpi": "520",
        "device_id": str(10**18 + random.randrange(8 * 10**18)),
        "iid": str(10**18 + random.randrange(8 * 10**18)),
        "_rticket": str(int(now * 1000)),
    }
    # 字典序编码（与 Go url.Values.Encode 一致）
    query_str = urllib.parse.urlencode(sorted(q.items()))
    body = json.dumps(body_obj, separators=(',', ':')).encode()
    gorgon, stub = sign(query_str, body, now)
    headers = {
        "User-Agent": UA, "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json", "X-Gorgon": gorgon, "X-Khronos": str(now),
        "X-SS-Req-Ticket": str(int(now * 1000)), "X-XS-From-Web": "0", "Sdk-Version": "2",
    }
    if stub: headers["X-SS-STUB"] = stub
    req = urllib.request.Request(BASE + path + "?" + query_str, data=body, headers=headers, method="POST")
    r = urllib.request.urlopen(req, timeout=25)
    raw = r.read()
    return r.status, raw

# 实测：先拿分类 feed 验证签名通道
st, raw = call("/reading/distribution/category/landpage/v/", {})
print("landpage status", st, "bytes", len(raw))
if raw:
    j = json.loads(raw)
    print("landpage code:", j.get("code"), "| keys:", list((j.get("data") or {}).keys())[:6])

# ── 第二步：video_model/v1 取第4集加密流 ──
VID4 = "7690223127078374425"
st, raw = call("/novel/player/video_model/v1/", {"video_id": VID4, "content_type": 1, "biz_param": {"need_all_video_definition": True, "video_platform": 3}})
print("video_model status", st, "bytes", len(raw))
if raw:
    j = json.loads(raw)
    print("vm code:", j.get("code"))
    d = j.get("data") or {}
    vm = d.get("video_model")
    if isinstance(vm, str):
        vm = json.loads(vm)
    vl = (vm or {}).get("video_list") or []
    print("video_list:", len(vl))
    for v in vl[:3]:
        meta = v.get("video_meta") or {}
        ei = v.get("encrypt_info") or {}
        print(" ", meta.get("definition"), meta.get("codec_type"), "| main_url:", bool(v.get("main_url")), "| spade_a:", (ei.get("spade_a") or '')[:24], "| method:", ei.get("encryption_method"))
    if vl:
        open('/tmp/hg_vm.json','w').write(json.dumps(vl[0], ensure_ascii=False))
