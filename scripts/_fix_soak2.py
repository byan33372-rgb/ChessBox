# Fix SG soak join logging (uses correct template literal escaping)
import pathlib

p = pathlib.Path('scripts/sg-soak.mjs')
s = p.read_text(encoding='utf-8')

# Fix join to log the seat
lines = s.split('\n')
for i, ln in enumerate(lines):
    if 'room:join' in ln and 'stats.errors' in ln:
        lines[i] = ln.rstrip() + "\n    console.log('[soak] join seat', r.seat);"
        break

# Also log create seat
for i, ln in enumerate(lines):
    if 'room:create' in ln and 'create FAIL' in ln:
        if 'create seat' not in ln:
            lines[i] = ln.replace("res(r.ok ? r.roomId : null);", "console.log('[soak] create seat', r.seat); res(r.ok ? r.roomId : null);")
        break

p.write_text('\n'.join(lines), encoding='utf-8')
print('ok')
