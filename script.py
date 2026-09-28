import json
from collections import Counter

with open('data/room_schedule.json') as f:
    sched = json.load(f)
with open('data/rooms.json') as f:
    rooms = json.load(f)

print('--- SECTIONS ---')
sections = set(x['section'] for x in sched)
for s in sorted(sections):
    print(s)

print('\n--- ROOMS (Occupied periods per week) ---')
counts = Counter(x['room'] for x in sched)
for r in rooms:
    print(f"{r['id']} (Floor {r['floor']}): {counts.get(r['id'], 0)} periods")

print('\n--- MONDAY GRID (I ECE-A) ---')
mon_a = sorted([x for x in sched if x['section'] == 'I ECE-A' and x['day'] == 'Monday'], key=lambda x: x['period'])
for x in mon_a:
    print(f"Period {x['period']}: {x['subject']} in {x['room']}")

print('\n--- MONDAY GRID (II BME) ---')
mon_b = sorted([x for x in sched if x['section'] == 'II BME' and x['day'] == 'Monday'], key=lambda x: x['period'])
for x in mon_b:
    print(f"Period {x['period']}: {x['subject']} in {x['room']}")
