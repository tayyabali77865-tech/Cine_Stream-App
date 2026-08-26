const headersContainer = document.getElementById('headersContainer');
const addHeaderBtn = document.getElementById('addHeaderBtn');
const headerForm = document.getElementById('headerForm');
const toggleBtn = document.getElementById('toggleBtn');
const statusText = document.getElementById('status');

const RULE_ID = 1000;

// Load state
chrome.storage.sync.get(['headers', 'enabled'], ({ headers = [], enabled = true }) => {
  updateUI(headers, enabled);
});

function updateUI(headers, enabled) {
  statusText.textContent = `Status: ${enabled ? "Active" : "Paused"}`;
  toggleBtn.textContent = enabled ? "Pause" : "Resume";
  headersContainer.innerHTML = '';

  headers.forEach(({ name, value }) => {
    addHeaderRow(name, value);
  });
}

function addHeaderRow(name = '', value = '') {
  const div = document.createElement('div');
  div.className = 'header-row';

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Header';
  nameInput.value = name;

  const valueInput = document.createElement('input');
  valueInput.placeholder = 'Value';
  valueInput.value = value;

  const removeBtn = document.createElement('button');
  removeBtn.textContent = '';
  removeBtn.type = 'button';
  removeBtn.onclick = () => div.remove();

  div.appendChild(nameInput);
  div.appendChild(valueInput);
  div.appendChild(removeBtn);

  headersContainer.appendChild(div);
}

addHeaderBtn.addEventListener('click', () => {
  addHeaderRow();
});

headerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const headers = [];

  headersContainer.querySelectorAll('.header-row').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const name = inputs[0].value.trim();
    const value = inputs[1].value.trim();
    if (name && value) {
      headers.push({ name, value });
    }
  });

  chrome.storage.sync.set({ headers }, () => {
    applyHeaders(headers);
    alert('Headers saved and applied.');
  });
});

toggleBtn.addEventListener('click', () => {
  chrome.storage.sync.get(['enabled'], ({ enabled = true }) => {
    const newState = !enabled;
    chrome.storage.sync.set({ enabled: newState }, () => {
      statusText.textContent = `Status: ${newState ? "Active" : "Paused"}`;
      toggleBtn.textContent = newState ? "Pause" : "Resume";

      if (newState) {
        chrome.storage.sync.get(['headers'], ({ headers = [] }) => {
          applyHeaders(headers);
        });
      } else {
        removeRule();
      }
    });
  });
});

// Apply dynamic rule
function applyHeaders(headers) {
  removeRule(() => {
    if (!headers.length) return;

    const rule = {
      id: RULE_ID,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: headers.map(({ name, value }) => ({
          header: name,
          operation: "set",
          value
        }))
      },
      condition: {
        urlFilter: "*",
        resourceTypes: ["xmlhttprequest", "main_frame","sub_frame","media"]
      }
    };

    chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [rule],
      removeRuleIds: []
    });
  });
}

// Remove rule helper
function removeRule(callback) {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID]
  }, callback || (() => {}));
}
