#!/usr/bin/env python3
"""guoapp 备用播放链路全链验证：relay → 解包 → key_urls → spade_a → AES key → ffmpeg 解密"""
import base64, json, urllib.request, subprocess, sys

def b64d(v):
    v = v.strip()
    try:
        return base64.b64decode(v)
    except Exception:
        pad = '=' * (-len(v) % 4)
        return base64.b64decode(v + pad)

def rotl8(v, n):
    return ((v << n) | (v >> (8 - n))) & 0xff

def popcount(x):
    return bin(x).count('1')

def decode_playback(body):
    text = body.strip()
    if not text.startswith('v2.'):
        return text.encode()
    parts = text.split('.', 2)
    assert len(parts) == 3
    encoded = bytes.fromhex(parts[1][4:])
    mask = bytes([104,64,70,166,190,168,143,130,225,254,251,217,196,34,45,60,29,20,103,105])
    material = bytearray(len(encoded))
    for i, cur in enumerate(encoded):
        prev = encoded[i-1] if i > 0 else 109
        slot = i % len(mask)
        salt = mask[slot] ^ ((90 + 13 * slot) & 0xff) ^ 85
        shifted = (cur + 215 - 11 * i) & 0xff
        material[i] = prev ^ salt ^ rotl8(shifted, 3)
    from Crypto.Cipher import AES
    ct = b64d(parts[2])
    cipher = AES.new(bytes(material[:16]), AES.MODE_CBC, bytes(material[16:32]))
    plain = cipher.decrypt(ct)
    pad = plain[-1]
    return plain[:-pad]

def content_key(spade_a):
    raw = b64d(spade_a)
    tag_len = (raw[0] ^ raw[1] ^ raw[2]) - 48
    content_len = len(raw) - tag_len - 1
    seed = raw[len(raw)-tag_len-2] ^ raw[len(raw)-tag_len-1]
    tag = bytes(raw[len(raw)-tag_len+i] ^ seed for i in range(tag_len))
    if tag in (b'app_v2', b'web_v2'):
        raise ValueError('版本不支持: ' + tag.decode())
    decoded = bytearray(content_len)
    prev_even, prev_odd = 250, 85
    for i, cur in enumerate(raw[1:1+content_len]):
        if i % 2 == 0:
            prev = prev_even; prev_even = cur
        else:
            prev = prev_odd; prev_odd = cur
        decoded[i] = (prev ^ cur) - 21 - popcount(i)
    padding = int(chr(decoded[0]), 36)
    key_hex = bytes(decoded[1:33]).decode()
    return key_hex

def play(series_id, vid):
    payload = base64.b64encode(json.dumps({"content_type":1004,"series_id":series_id,"vid":vid,"video_platform":3}).encode()).decode()
    url = f"https://djapi.999888456.xyz/api/hongguo/play?id={payload}"
    req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
    raw = urllib.request.urlopen(req, timeout=20).read()
    plain = decode_playback(raw.decode())
    j = json.loads(plain)
    kus = j.get('key_urls') or []
    print('key_urls:', len(kus))
    for k in kus[:4]:
        print('  name:', k.get('name'), '| src:', (k.get('src') or '')[:60], '| kid:', (k.get('kid') or '')[:16], '| spade_a:', (k.get('spade_a') or '')[:16])
    return kus

if __name__ == '__main__':
    kus = play("7690163276214176792", "7690223127078374425")  # 第4集
    if kus:
        best = kus[0]
        key = content_key(best['spade_a'])
        print('derived AES key:', key)
        with open('/tmp/hg_ep4_stream.txt','w') as f:
            f.write(best['src'] + '\n' + key + '\n' + best['name'])
        print('saved /tmp/hg_ep4_stream.txt')
