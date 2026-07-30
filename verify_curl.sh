cd /home/openclaw/projects/1ai-content

echo "=== /text/caption (topic+style) ==="
curl -s -m 8 -X POST http://127.0.0.1:8767/text/caption \
  -H "Content-Type: application/json" \
  -d '{"topic":"test","style":"story"}' | head -c 200
echo ""

echo "=== /video/ad (title+cat+desc) ==="
curl -s -m 8 -X POST http://127.0.0.1:8767/video/ad \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Product","category":"food","description":"test"}' | head -c 200
echo ""

echo "=== /autopilot/create ==="
curl -s -m 8 -X POST http://127.0.0.1:8767/autopilot/create \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","niche":"tech","platforms":["tiktok"],"posting_times":["09:00"],"videos_per_day":1,"auto_publish":false}' | head -c 200
echo ""

echo "=== /cloak/batch-post profile_ids ==="
curl -s -m 8 -X POST http://127.0.0.1:8767/cloak/batch-post \
  -H "Content-Type: application/json" \
  -d '{"profile_ids":["test"],"media_path":"test.mp4","caption":"test","platform":"tiktok"}' | head -c 200
echo ""

echo "=== /cloak/batch-post profile_id ==="
curl -s -m 8 -X POST http://127.0.0.1:8767/cloak/batch-post \
  -H "Content-Type: application/json" \
  -d '{"profile_id":"test","media_path":"test.mp4","caption":"test","platform":"tiktok"}' | head -c 200
echo ""

echo "=== /autopilot/run ==="
curl -s -m 8 -X POST http://127.0.0.1:8767/autopilot/run | head -c 200
echo ""

echo "=== /calendar/list/1 ==="
curl -s -m 5 -X GET http://127.0.0.1:8767/calendar/list/1 | head -c 200
echo ""

echo "=== /ab-test/create ==="
curl -s -m 5 -X POST http://127.0.0.1:8767/ab-test/create \
  -H "Content-Type: application/json" \
  -d '{"description":"test"}' | head -c 200
echo ""
