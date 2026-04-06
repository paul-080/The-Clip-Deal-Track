# Auth Testing Playbook for The Clip Deal Track

## Step 1: Create Test User & Session

```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  role: 'agency',
  display_name: 'Test Agency',
  created_at: new Date(),
  settings: {}
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Step 2: Test Backend API

```bash
# Test auth endpoint
curl -X GET "https://clip-manager-pro.preview.emergentagent.com/api/auth/me" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

# Test create campaign
curl -X POST "https://clip-manager-pro.preview.emergentagent.com/api/campaigns" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{
    "name": "Test Campaign",
    "rpm": 3.50,
    "platforms": ["tiktok", "youtube"],
    "strike_days": 3,
    "cadence": 1
  }'
```

## Step 3: Browser Testing

```python
# Set cookie and navigate
await page.context.add_cookies([{
    "name": "session_token",
    "value": "YOUR_SESSION_TOKEN",
    "domain": "clip-manager-pro.preview.emergentagent.com",
    "path": "/",
    "httpOnly": True,
    "secure": True,
    "sameSite": "None"
}])
await page.goto("https://clip-manager-pro.preview.emergentagent.com/agency")
```

## Quick Debug

```bash
# Check data format
mongosh --eval "
use('test_database');
db.users.find().limit(2).pretty();
db.user_sessions.find().limit(2).pretty();
"

# Clean test data
mongosh --eval "
use('test_database');
db.users.deleteMany({email: /test\.user\./});
db.user_sessions.deleteMany({session_token: /test_session/});
"
```

## Checklist
- [ ] User document has user_id field
- [ ] Session user_id matches user's user_id exactly
- [ ] All queries use `{"_id": 0}` projection
- [ ] Backend queries use user_id (not _id or id)
- [ ] API returns user data (not 401/404)
- [ ] Browser loads dashboard (not login page)
