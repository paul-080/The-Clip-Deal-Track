#!/usr/bin/env python3
"""
Backend API Testing for The Clip Deal Track
Tests all major endpoints with proper authentication
"""

import requests
import sys
import json
import subprocess
from datetime import datetime, timezone, timedelta
import uuid

class ClipDealTrackTester:
    def __init__(self, base_url="https://clip-manager-pro.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session_token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_result(self, test_name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name} - PASSED")
        else:
            print(f"❌ {test_name} - FAILED: {details}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })

    def setup_test_user(self):
        """Create test user and session in MongoDB"""
        print("\n🔧 Setting up test user and session...")
        
        timestamp = int(datetime.now().timestamp())
        self.user_id = f"test-user-{timestamp}"
        self.session_token = f"test_session_{timestamp}"
        
        mongo_script = f"""
        use('test_database');
        var userId = '{self.user_id}';
        var sessionToken = '{self.session_token}';
        
        // Clean up any existing test data
        db.users.deleteMany({{email: /test\\.user\\./}});
        db.user_sessions.deleteMany({{session_token: /test_session/}});
        
        // Create test user
        db.users.insertOne({{
            user_id: userId,
            email: 'test.user.{timestamp}@example.com',
            name: 'Test User',
            picture: 'https://via.placeholder.com/150',
            role: 'agency',
            display_name: 'Test Agency',
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
        
        print('Test user created: ' + userId);
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
                print(f"✅ Test user created: {self.user_id}")
                print(f"✅ Session token: {self.session_token}")
                return True
            else:
                print(f"❌ MongoDB setup failed: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"❌ MongoDB setup error: {str(e)}")
            return False

    def test_api_endpoint(self, method, endpoint, expected_status, data=None, auth_required=True):
        """Test a single API endpoint"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if auth_required and self.session_token:
            headers['Authorization'] = f'Bearer {self.session_token}'
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            
            success = response.status_code == expected_status
            
            if success:
                try:
                    response_data = response.json()
                    return True, response_data
                except:
                    return True, {"message": "Success"}
            else:
                error_detail = f"Expected {expected_status}, got {response.status_code}"
                try:
                    error_data = response.json()
                    error_detail += f" - {error_data.get('detail', '')}"
                except:
                    error_detail += f" - {response.text[:100]}"
                return False, error_detail
                
        except requests.exceptions.Timeout:
            return False, "Request timeout"
        except requests.exceptions.ConnectionError:
            return False, "Connection error"
        except Exception as e:
            return False, f"Request error: {str(e)}"

    def run_basic_tests(self):
        """Test basic API endpoints"""
        print("\n🔍 Testing basic API endpoints...")
        
        # Test root endpoint
        success, result = self.test_api_endpoint('GET', '', 200, auth_required=False)
        self.log_result("API Root Endpoint", success, result if not success else "")
        
        # Test health endpoint
        success, result = self.test_api_endpoint('GET', 'health', 200, auth_required=False)
        self.log_result("Health Check", success, result if not success else "")

    def run_auth_tests(self):
        """Test authentication endpoints"""
        print("\n🔍 Testing authentication...")
        
        # Test /auth/me with valid token
        success, result = self.test_api_endpoint('GET', 'auth/me', 200)
        self.log_result("Auth Me Endpoint", success, result if not success else "")
        
        if success and isinstance(result, dict):
            if result.get('user_id') == self.user_id:
                print(f"✅ User ID matches: {self.user_id}")
            else:
                print(f"⚠️  User ID mismatch: expected {self.user_id}, got {result.get('user_id')}")

    def run_campaign_tests(self):
        """Test campaign endpoints"""
        print("\n🔍 Testing campaign endpoints...")
        
        # Test get campaigns
        success, result = self.test_api_endpoint('GET', 'campaigns', 200)
        self.log_result("Get Campaigns", success, result if not success else "")
        
        # Test create campaign
        campaign_data = {
            "name": "Test Campaign",
            "rpm": 3.50,
            "platforms": ["tiktok", "youtube"],
            "strike_days": 3,
            "cadence": 1,
            "budget_unlimited": True
        }
        
        success, result = self.test_api_endpoint('POST', 'campaigns', 200, campaign_data)
        self.log_result("Create Campaign", success, result if not success else "")
        
        if success and isinstance(result, dict):
            campaign_id = result.get('campaign_id')
            if campaign_id:
                print(f"✅ Campaign created: {campaign_id}")
                
                # Test get specific campaign
                success, result = self.test_api_endpoint('GET', f'campaigns/{campaign_id}', 200)
                self.log_result("Get Specific Campaign", success, result if not success else "")
                
                # Test get campaign links
                success, result = self.test_api_endpoint('GET', f'campaigns/{campaign_id}/links', 200)
                self.log_result("Get Campaign Links", success, result if not success else "")

    def run_social_accounts_tests(self):
        """Test social accounts endpoints"""
        print("\n🔍 Testing social accounts...")
        
        # Test get social accounts
        success, result = self.test_api_endpoint('GET', 'social-accounts', 200)
        self.log_result("Get Social Accounts", success, result if not success else "")

    def run_messages_tests(self):
        """Test messages endpoints"""
        print("\n🔍 Testing messages...")
        
        # Create a test campaign first for messages
        campaign_data = {
            "name": "Message Test Campaign",
            "rpm": 2.00,
            "platforms": ["tiktok"],
            "strike_days": 3,
            "cadence": 1
        }
        
        success, campaign_result = self.test_api_endpoint('POST', 'campaigns', 200, campaign_data)
        if success and isinstance(campaign_result, dict):
            campaign_id = campaign_result.get('campaign_id')
            
            # Test get messages for campaign
            success, result = self.test_api_endpoint('GET', f'campaigns/{campaign_id}/messages', 200)
            self.log_result("Get Campaign Messages", success, result if not success else "")
            
            # Test send message
            message_data = {
                "campaign_id": campaign_id,
                "content": "Test message",
                "message_type": "chat"
            }
            
            success, result = self.test_api_endpoint('POST', 'messages', 200, message_data)
            self.log_result("Send Message", success, result if not success else "")

    def run_announcements_tests(self):
        """Test announcements endpoints"""
        print("\n🔍 Testing announcements...")
        
        # Test get announcements
        success, result = self.test_api_endpoint('GET', 'announcements', 200)
        self.log_result("Get Announcements", success, result if not success else "")
        
        # Test create announcement
        announcement_data = {
            "title": "Test Announcement",
            "content": "This is a test announcement"
        }
        
        success, result = self.test_api_endpoint('POST', 'announcements', 200, announcement_data)
        self.log_result("Create Announcement", success, result if not success else "")

    def cleanup_test_data(self):
        """Clean up test data from MongoDB"""
        print("\n🧹 Cleaning up test data...")
        
        mongo_script = f"""
        use('test_database');
        db.users.deleteMany({{email: /test\\.user\\./}});
        db.user_sessions.deleteMany({{session_token: /test_session/}});
        db.campaigns.deleteMany({{name: /Test Campaign/}});
        db.messages.deleteMany({{content: /Test message/}});
        db.announcements.deleteMany({{title: /Test Announcement/}});
        print('Test data cleaned up');
        """
        
        try:
            subprocess.run(["mongosh", "--eval", mongo_script], timeout=30)
            print("✅ Test data cleaned up")
        except Exception as e:
            print(f"⚠️  Cleanup warning: {str(e)}")

    def print_summary(self):
        """Print test summary"""
        print(f"\n📊 Test Summary:")
        print(f"Tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.tests_passed < self.tests_run:
            print(f"\n❌ Failed tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")

def main():
    """Main test execution"""
    print("🚀 Starting The Clip Deal Track Backend API Tests")
    print("=" * 60)
    
    tester = ClipDealTrackTester()
    
    # Setup test user
    if not tester.setup_test_user():
        print("❌ Failed to setup test user. Exiting.")
        return 1
    
    try:
        # Run all test suites
        tester.run_basic_tests()
        tester.run_auth_tests()
        tester.run_campaign_tests()
        tester.run_social_accounts_tests()
        tester.run_messages_tests()
        tester.run_announcements_tests()
        
        # Print summary
        tester.print_summary()
        
        # Cleanup
        tester.cleanup_test_data()
        
        # Return appropriate exit code
        return 0 if tester.tests_passed == tester.tests_run else 1
        
    except KeyboardInterrupt:
        print("\n⚠️  Tests interrupted by user")
        tester.cleanup_test_data()
        return 1
    except Exception as e:
        print(f"\n❌ Unexpected error: {str(e)}")
        tester.cleanup_test_data()
        return 1

if __name__ == "__main__":
    sys.exit(main())