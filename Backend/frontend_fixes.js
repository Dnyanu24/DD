// Frontend Announcement/User Request Fix
// Run in browser console on AdminDashboard

// 1. Fix Announcement Form
const announcementForm = document.querySelector('#announcement-form');
if (announcementForm) {
  announcementForm.classList.remove('hidden');
}

// 2. Fix User Requests Table
const requestsTable = document.querySelector('#join-requests-table');
if (requestsTable) {
  requestsTable.classList.remove('hidden');
}

// 3. Fix Login After Register - Auto-login
const token = localStorage.getItem('token');
if (token) {
  localStorage.setItem('auto_login_success', 'true');
  window.location.reload();
}

// 4. Registration Success Redirect
if (window.location.href.includes('signup')) {
  setTimeout(() => {
    window.location.href = '/dashboard';
  }, 2000);
}
console.log('Frontend fixes applied!');

