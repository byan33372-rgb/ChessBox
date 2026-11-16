# Fix SG soak: capture view from ack, log create failure
import pathlib

p = pathlib.Path('scripts/sg-soak.mjs')
s = p.read_text(encoding='utf-8')

# 1) cmd(): store view from ack
old_cmd = "      stats.commands += 1;\n      if (!r?.ok) stats.rejected += 1;\n      res(r);"
new_cmd = ("      stats.commands += 1;\n"
           "      if (!r?.ok) stats.rejected += 1;\n"
           "      if (r?.view) { latest = r.view; for (const w of waiters.splice(0)) w(); }\n"
           "      res(r);")
if old_cmd in s:
    s = s.replace(old_cmd, new_cmd)
    print('cmd view capture fixed')

# 2) create: log failure
old_create = "socks[0].emit('room:create', { kind: 'sanguosha', seatCount: playerCount, name: `soak${++seq}` }, (r) => res(r.ok ? r.roomId : null));"
new_create = ("socks[0].emit('room:create', { kind: 'sanguosha', seatCount: playerCount, name: `soak${++seq}` }, (r) => {\n"
              "    if (!r.ok) console.log('[soak] create FAIL', JSON.stringify(r.error));\n"
              "    res(r.ok ? r.roomId : null);\n"
              "  });")
if old_create in s:
    s = s.replace(old_create, new_create)
    print('create logging fixed')

p.write_text(s, encoding='utf-8')
print('done')
