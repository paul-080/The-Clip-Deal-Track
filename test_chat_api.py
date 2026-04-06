#!/usr/bin/env python3
"""
Test the specific API endpoint mentioned in the review request:
/api/campaigns/{id}/clippers-advice-status
"""

import requests
import subprocess
import sys
from datetime import datetime, timezone, timedelta

def setup_test_user():
    """Create test user and session in MongoDB"""
    print("🔧 Setting up test user and session...")
    
    timestamp = int(datetime.now().timestamp())
    user_id = f"test-manager-{timestamp}"
    session_token = f"test_session_{timestamp}"
    
    mongo_script = f"""
    use('test_database');
    var userId = '{user_id}';
    var sessionToken = '{session_token}';
    var campaignId = 'camp_31266e444495';
    
    // Clean up any existing test data
    db.users.deleteMany({{email: /test\\.manager\\./}});
    db.user_sessions.deleteMany({{session_token: /test_session/}});
    
    // Create test manager user
    db.users.insertOne({{
        user_id: userId,
        email: 'test.manager.{timestamp}@example.com',
        name: 'Test Manager',
        picture: 'https://via.placeholder.com/150',
        role: 'manager',
        display_name: 'Test Manager',
        created_at: new Date(),
        settings: {{}}
    }});
    
    // Create session
    db.user_sessions.insertOne({{
        user_id: userId,
        session_token: sessionToken,
        expires_at: new Date(Date.now() + 7*24*60*60*1000),
        created_at: new Date()
    }});
    
    // Ensure campaign exists
    db.campaigns.updateOne(
        {{campaign_id: campaignId}},
        {{$setOnInsert: {{
            campaign_id: campaignId,
            agency_id: 'test-agency-123',
            name: 'Test Campaign for Chat',
            rpm: 3.50,
            platforms: ['tiktok'],
            strike_days: 3,
            cadence: 1,
            budget_unlimited: true,
            created_at: new Date(),
            status: 'active',
            token_clipper: 'test-clipper-token',
            token_manager: 'test-manager-token',
            token_client: 'test-client-token'
        }}}},
        {{upsert: true}}
    );
    
    // Add some test clippers to the campaign
    db.campaign_members.insertMany([
        {{
            member_id: 'mem_test_clipper_1',
            campaign_id: campaignId,
            user_id: 'session_clipper_1774450048993',
            role: 'clipper',
            status: 'active',
            joined_at: new Date(),
            strikes: 0
        }},
        {{
            member_id: 'mem_test_clipper_2',
            campaign_id: campaignId,
            user_id: 'test_clipper_2',
            role: 'clipper',
            status: 'active',
            joined_at: new Date(),
            strikes: 0
        }}
    ]);
    
    // Add corresponding user records for clippers
    db.users.updateOne(
        {{user_id: 'session_clipper_1774450048993'}},
        {{$setOnInsert: {{
            user_id: 'session_clipper_1774450048993',
            email: 'clipper1@example.com',
            name: 'Test Clipper 1',
            role: 'clipper',
            display_name: 'TestClipper1',
            created_at: new Date()
        }}}},
        {{upsert: true}}
    );
    
    db.users.updateOne(
        {{user_id: 'test_clipper_2'}},
        {{$setOnInsert: {{
            user_id: 'test_clipper_2',
            email: 'clipper2@example.com',
            name: 'Test Clipper 2',
            role: 'clipper',
            display_name: 'TestClipper2',
            created_at: new Date()
        }}}},
        {{upsert: true}}
    );
    
    print('Test manager created: ' + userId);
    print('Session token: ' + sessionToken);
    """
    
    try:
        result = subprocess.run(
            ["mongosh", "--eval", mongo_script],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            print(f"✅ Test manager created: {user_id}")
            return user_id, session_token
        else:
            print(f"❌ MongoDB setup failed: {result.stderr}")
            return None, None
            
    except Exception as e:
        print(f"❌ MongoDB setup error: {str(e)}")
        return None, None

def test_clippers_advice_status_api():
    """Test the clippers advice status API endpoint"""
    print("🚀 Testing /api/campaigns/{id}/clippers-advice-status endpoint")
    
    # Setup test user
    user_id, session_token = setup_test_user()
    if not user_id or not session_token:
        print("❌ Failed to setup test user")
        return False
    
    # Test the API endpoint
    base_url = "https://clip-manager-pro.preview.emergentagent.com"
    campaign_id = "camp_31266e444495"
    url = f"{base_url}/api/campaigns/{campaign_id}/clippers-advice-status"
    
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {session_token}'
    }
    
    try:
        print(f"📡 Making request to: {url}")
        response = requests.get(url, headers=headers, timeout=10)
        
        print(f"📊 Response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✅ API endpoint working correctly")
            print(f"📋 Response data: {data}")
            
            # Check if clippers array exists
            if 'clippers' in data:
                clippers = data['clippers']
                print(f"✅ Found {len(clippers)} clippers in response")
                
                for i, clipper in enumerate(clippers):
                    print(f"  Clipper {i+1}: {clipper.get('display_name', clipper.get('name', 'Unknown'))}")
                    print(f"    - Needs advice: {clipper.get('needs_advice', False)}")
                    print(f"    - Hours since advice: {clipper.get('hours_since_advice', 'N/A')}")
                
                return True
            else:
                print("⚠️  No 'clippers' field in response")
                return False
        else:
            print(f"❌ API request failed: {response.status_code}")
            try:
                error_data = response.json()
                print(f"Error details: {error_data}")
            except:
                print(f"Error text: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Request error: {str(e)}")
        return False

def cleanup():
    """Clean up test data"""
    print("\n🧹 Cleaning up test data...")
    
    mongo_script = """
    use('test_database');
    db.users.deleteMany({email: /test\\.manager\\./});
    db.user_sessions.deleteMany({session_token: /test_session/});
    db.campaign_members.deleteMany({member_id: /mem_test_clipper/});
    print('Test data cleaned up');
    """
    
    try:
        subprocess.run(["mongosh", "--eval", mongo_script], timeout=30)
        print("✅ Test data cleaned up")
    except Exception as e:
        print(f"⚠️  Cleanup warning: {str(e)}")

def main():
    """Main test execution"""
    try:
        success = test_clippers_advice_status_api()
        cleanup()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n⚠️  Test interrupted by user")
        cleanup()
        return 1
    except Exception as e:
        print(f"\n❌ Unexpected error: {str(e)}")
        cleanup()
        return 1

if __name__ == "__main__":
    sys.exit(main())