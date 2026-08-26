const USER_AGENT_RULE_ID = 999;
var ade =  'https://fmoviesunblocked.net/';
const DEFAULT_USER_AGENT = {
  name: "Referer",
  value: ade
};
const USER_AGENT_URL_FILTER = "hakunaymatata";

function applyDefaultUserAgentRule(callback) {
  const rule = {
    id: USER_AGENT_RULE_ID,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [{
        header: DEFAULT_USER_AGENT.name,
        operation: "set",
        value: DEFAULT_USER_AGENT.value
      }]
    },
    condition: {
      urlFilter: USER_AGENT_URL_FILTER,
      resourceTypes: ["xmlhttprequest", "main_frame","sub_frame","media"]
    }
  };

  chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [rule],
    removeRuleIds: [USER_AGENT_RULE_ID]
  }, callback || (() => {}));
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['enabled'], ({ enabled = true }) => {
    if (enabled) {
      applyDefaultUserAgentRule();
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get(['enabled'], ({ enabled = true }) => {
    if (enabled) {
      applyDefaultUserAgentRule();
    }
  });
});
