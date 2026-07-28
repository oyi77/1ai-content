// Delete project with confirmation modal
let _deleteTarget = null;

function deleteProject(id) {
  _deleteTarget = id;
  document.getElementById('deleteProjectId').textContent = id;
  document.getElementById('deleteModal').style.display = 'flex';
}

function cancelDelete() {
  document.getElementById('deleteModal').style.display = 'none';
  _deleteTarget = null;
}

async function confirmDelete() {
  if (!_deleteTarget) return;
  const id = _deleteTarget;
  cancelDelete();
  const resp = await fetch(`/admin/api/projects/${id}`, {
    method: 'DELETE',
    headers: { 'X-API-Key': window._adminKey || '' }
  });
  if (resp.ok) {
    showToast('Project deleted', 'success');
    setTimeout(() => location.reload(), 800);
  } else {
    showToast('Delete failed', 'error');
  }
}

// Toast notifications
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// Search/filter for projects table
function filterProjects() {
  const q = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const status = document.getElementById('statusFilter')?.value || '';
  document.querySelectorAll('tbody tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    const rowStatus = row.dataset.status || '';
    const matchQ = !q || text.includes(q);
    const matchS = !status || rowStatus === status;
    row.style.display = (matchQ && matchS) ? '' : 'none';
  });
}

// Auto-attach listeners on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('searchInput')?.addEventListener('input', filterProjects);
  document.getElementById('statusFilter')?.addEventListener('change', filterProjects);
});

// Mobile sidebar toggle
function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
}

async function refreshStats() {
  const resp = await fetch('/admin/api/stats');
  if (resp.ok) {
    const data = await resp.json();
    // Update stat cards if present
    ['total', 'completed', 'generating', 'failed'].forEach(k => {
      const el = document.getElementById(`stat-${k}`);
      if (el && data[k] !== undefined) el.textContent = data[k];
    });
    showToast('Stats refreshed', 'success');
  }
}
