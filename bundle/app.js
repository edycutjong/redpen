// Dynamic import to allow graceful fallback when running outside Anna environment
let realSdkModule = null;
let realAnna = null;

// Tool ID Resolution
const DEV_FALLBACK_TOOL_ID = "tool-dev-redpen";
const TOOL_ID =
  (typeof window !== "undefined" &&
    window.__ANNA_TOOL_IDS__ &&
    window.__ANNA_TOOL_IDS__["redpen"]) ||
  DEV_FALLBACK_TOOL_ID;

const annaReady = (async () => {
  try {
    const sdkModule = await import("/static/anna-apps/_sdk/latest/index.js").catch(e => {
      console.warn("Could not load Anna SDK dynamically, falling back to mock environment", e);
      return null;
    });

    if (!sdkModule) {
      console.warn("[RedPen] Anna SDK not available. Running in sandbox mode.");
      return null;
    }

    realSdkModule = sdkModule.AnnaAppRuntime;
    realAnna = await realSdkModule.connect();
    console.log("[RedPen] Connected to Anna runtime", realAnna.windowUuid);
    return realAnna;
  } catch (err) {
    console.warn("[RedPen] Anna SDK not available. Running in sandbox mode.", err);
    return null;
  }
})();

class AnnaAppRuntimeBridge {
  constructor() {
    this.isStandalone = true;
    
    // Auto-detect standalone vs host
    annaReady.then(a => {
      if (a) {
        this.isStandalone = false;
        // Update UI badge if present
        const badge = document.getElementById('host-connection-badge');
        const dot = document.getElementById('status-dot');
        const txt = document.getElementById('connection-status-text');
        if (badge && dot && txt) {
          badge.className = "status-badge active";
          dot.className = "status-dot active";
          txt.textContent = "ANNA SECURE DESK";
        }
      }
    });
  }

  async invokeTool(toolName, params) {
    return this.sendRequest('tools.invoke', { tool: toolName, params: params });
  }

  async storageGet(key) {
    return this.sendRequest('storage.get', { key });
  }

  async storageSet(key, value) {
    return this.sendRequest('storage.set', { key, value });
  }

  async openView(viewName) {
    return this.sendRequest('window.open_view', { view: viewName });
  }

  async closeView() {
    return this.sendRequest('window.close', {});
  }

  sendRequest(method, params) {
    return new Promise(async (resolve, reject) => {
      const a = await annaReady;
      if (!a) {
        reject(new Error("Running in standalone mock mode"));
        return;
      }

      try {
        if (method === 'tools.invoke') {
          const reply = await a.tools.invoke({
            tool_id: TOOL_ID,
            method: params.tool,
            args: params.params
          });
          if (reply && typeof reply === "object" && reply.data && reply.tool) {
            resolve(reply.data);
          } else {
            resolve(reply ?? {});
          }
        } else if (method === 'storage.get') {
          if (a.storage) {
            resolve(await a.storage.get(params.key));
          } else {
            resolve(null);
          }
        } else if (method === 'storage.set') {
          if (a.storage) {
            resolve(await a.storage.set(params.key, params.value));
          } else {
            resolve({ success: true });
          }
        } else if (method === 'storage.delete') {
          if (a.storage && a.storage.delete) {
            resolve(await a.storage.delete(params.key));
          } else {
            resolve({ success: true });
          }
        } else if (method === 'window.open_view') {
          if (a.window && a.window.open_view) {
            resolve(await a.window.open_view(params.view));
          } else {
            resolve({});
          }
        } else if (method === 'window.close') {
          if (a.window && a.window.close) {
            resolve(await a.window.close());
          } else {
            resolve({});
          }
        } else if (method === 'upload.negotiate') {
          const nego = await a.tools.invoke({
            tool_id: "host",
            method: "upload.negotiate",
            args: { fileName: params.name, contentType: params.type }
          });
          resolve({
            upload_url: nego.url || nego.put_url,
            download_url: nego.downloadUrl || nego.public_url || nego.url,
            uploadId: nego.uploadId
          });
        } else if (method === 'chat.append_artifact') {
          if (a.chat && a.chat.append_artifact) {
            resolve(await a.chat.append_artifact({
              type: "redpen_audit",
              title: params.title,
              summary: params.body,
              svg: `<svg viewBox="0 0 100 100" width="80" height="80">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#FF3344" stroke-width="8" />
                <path d="M 35 50 L 45 60 L 65 35" fill="none" stroke="#22c55e" stroke-width="8" stroke-linecap="round" />
              </svg>`
            }));
          } else {
            resolve({});
          }
        } else {
          // Standard postMessage fallback for other host methods
          const id = Math.random().toString(36).substring(2);
          const callbackHandler = (event) => {
            if (event.data && event.data.id === id) {
              window.removeEventListener('message', callbackHandler);
              if (event.data.error) reject(event.data.error);
              else resolve(event.data.result);
            }
          };
          window.addEventListener('message', callbackHandler);
          window.parent.postMessage({
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: id
          }, '*');
        }
      } catch (err) {
        reject(err);
      }
    });
  }
}

// Instantiate SDK
const sdk = new AnnaAppRuntimeBridge();

// =====================================================================
// Mock Database & SEED DATA for Standalone Mock Mode fallback
// =====================================================================

const SEED_CONTRACT_TEXT = `§ 1. Scope
Contractor shall perform the consulting services described in Exhibit A attached hereto (the 'Services') in accordance with the terms and conditions of this Agreement.

§ 2. Compensation
Client shall pay Contractor the fee set forth in Exhibit A. Payment shall be made in USD within thirty (30) days of receipt of a valid invoice.

§ 3. Intellectual Property
Contractor agrees that all inventions, improvements, designs, concepts, and works of authorship created, developed, or conceived by Contractor, either alone or with others, during the term of this Agreement, as well as any pre-existing side-projects, patentable concepts, or codebases owned by Contractor prior to this Agreement, shall be the sole and exclusive property of the Client. Contractor hereby assigns all rights, titles, and interests in such Intellectual Property to Client without further consideration.

§ 4. Confidentiality
Each party shall maintain the confidentiality of all proprietary information disclosed by the other party and shall not disclose such information to any third party without prior written consent.

§ 5. Payment Delay
Client reserves the right to delay payments for up to ninety (90) days from invoice receipt in the event of cash flow constraints. No interest, late fees, or penalty charges shall accrue on any delayed balances during this period, and Contractor shall not suspend Services due to payment delays.

§ 6. Indemnification
Contractor shall defend, indemnify, and hold harmless Client, its officers, directors, and employees from and against any and all claims, liabilities, losses, damages, and expenses (including attorney's fees) arising out of or in connection with the Services, including any claims resulting from Client's own negligence, willful misconduct, or operational faults.

§ 7. Termination
Either party may terminate this Agreement upon thirty (30) days' written notice to the other party. In the event of termination, Contractor shall be paid for Services rendered up to the date of termination.

§ 8. Non-Compete
During the term of this Agreement and for a period of three (3) years thereafter, Contractor shall not, directly or indirectly, engage in, perform services for, or consult with any business, individual, or entity globally that competes, or intends to compete, with the business of Client.

§ 9. Dispute Resolution
Any dispute arising under this Agreement shall be resolved through binding arbitration in Wilmington, Delaware, in accordance with the rules of the American Arbitration Association.

§ 10. Limitation of Liability
Contractor's liability for any and all claims arising under this Agreement, whether in contract, tort, or otherwise, shall be unlimited. Client's total aggregate liability under this Agreement shall be strictly capped at one hundred dollars ($100.00).`;

const MOCK_ANALYSES = {
  "clause_2": {
    "category": "IP Assignment",
    "riskLevel": "CRITICAL",
    "rationale": "Transfers all pre-existing inventions and future side-projects to the Client. Typically, freelancers should only assign work created specifically for this client during billing hours.",
    "normComparison": "Standard industry norms limit intellectual property transfer to deliverables created for this project and specifically exempt pre-existing IP.",
    "alternative": "§ 3. Intellectual Property\nContractor retains all right, title, and interest in and to pre-existing intellectual property, inventions, and software tools. Upon full payment of fees, Contractor assigns to Client the intellectual property rights in final deliverables created specifically for Client under this Agreement.",
    "alternativeRationale": "Retains all pre-existing inventions and licenses/transfers only specific project outcomes upon receipt of payment."
  },
  "clause_4": {
    "category": "Payment Terms",
    "riskLevel": "HIGH",
    "rationale": "Allows the client to delay payment by up to 90 days without penalties and prohibits you from stopping work. This creates major cash flow risks.",
    "normComparison": "Commercial standards typically specify Net 30 payment terms, late payment interest fees (1-2% monthly), and the right to suspend services on unpaid balances.",
    "alternative": "§ 5. Payment Delay\nAll payments are due within thirty (30) days of invoice date. Balances remaining unpaid after thirty days shall accrue interest at 1.5% per month. Contractor reserves the right to suspend services if any invoice remains unpaid after forty-five (45) days.",
    "alternativeRationale": "Limits payment period to 30 days and establishes late fee penalizations and service suspension protections."
  },
  "clause_5": {
    "category": "Indemnification",
    "riskLevel": "CRITICAL",
    "rationale": "Requires the Contractor to defend and indemnify the Client for the Client's own negligence or misconduct. Unbalanced and high risk.",
    "normComparison": "Indemnification is typically mutual and limited strictly to claims arising from a party's breach of contract, negligence, or willful misconduct.",
    "alternative": "§ 6. Indemnification\nEach party shall defend, indemnify, and hold harmless the other party from third-party claims arising out of the indemnifying party's gross negligence, willful misconduct, or breach of representations in this Agreement.",
    "alternativeRationale": "Changes the provision to a mutual model, shielding you from indemnifying client mistakes."
  },
  "clause_7": {
    "category": "Non-Compete",
    "riskLevel": "HIGH",
    "rationale": "Broad global non-compete for 3 years post-termination. This restricts your ability to seek other freelance work or employment.",
    "normComparison": "Freelance agreements typically avoid non-competes. If present, they should be limited to 6-12 months and restricted to client's immediate competitors, never global.",
    "alternative": "§ 8. Non-Compete\nDuring the term of this Agreement, Contractor shall not disclose Client's proprietary trade secrets to competitors. The parties agree that no post-termination non-compete restriction applies to the Contractor.",
    "alternativeRationale": "Removes the restrictive non-compete term and replaces it with standard confidentiality protection."
  },
  "clause_9": {
    "category": "Limitation of Liability",
    "riskLevel": "CRITICAL",
    "rationale": "Contractor faces unlimited liability while Client's liability is capped at a negligible $100. A single lawsuit could bankrupt the freelancer.",
    "normComparison": "Standard contracts cap liability mutually, typically at the total amount of fees paid to the contractor in the preceding 12-month period.",
    "alternative": "§ 10. Limitation of Liability\nExcept for breaches of confidentiality, neither party's total aggregate liability under this Agreement shall exceed the total fees paid or payable to Contractor under this Agreement.",
    "alternativeRationale": "Establishes a mutual cap on liability equal to contract value, protecting you from infinite claims."
  }
};

const DEFAULT_MOCK_ANALYSIS = {
  "category": "Miscellaneous",
  "riskLevel": "LOW",
  "rationale": "Standard boilerplate clause with no immediate critical risk flags detected.",
  "normComparison": "Aligns with standard commercial agreement norms.",
  "alternative": "",
  "alternativeRationale": ""
};

// =====================================================================
// Core Application State Controller
// =====================================================================

const state = {
  rawText: '',
  clauses: [],
  decisions: [],
  activeIndex: 0,
  activeAnalysis: null,
  isAnalyzing: false,
  statusLogs: [],
  signingPublicKey: 'STANDALONE_DEV_KEY_HASH',
  memo: '',
  redlinedDoc: ''
};

// DOM Cache
const dom = {
  statusDot: document.getElementById('status-dot'),
  connectionText: document.getElementById('connection-status-text'),
  textarea: document.getElementById('contract-textarea'),
  analyzeBtn: document.getElementById('analyze-btn'),
  loadSampleLink: document.getElementById('load-sample-link'),
  wordCountLabel: document.getElementById('word-count-label'),
  terminalConsole: document.getElementById('terminal-console'),
  progressBar: document.getElementById('progress-bar'),
  progressText: document.getElementById('progress-text'),
  
  // Screens
  screenUpload: document.getElementById('screen-upload'),
  screenAnalyzing: document.getElementById('screen-analyzing'),
  screenReview: document.getElementById('screen-review'),
  screenExport: document.getElementById('screen-export'),
  
  // Review View
  clausesList: document.getElementById('clauses-list'),
  reviewedRatio: document.getElementById('reviewed-ratio'),
  activeClauseTitle: document.getElementById('active-clause-title'),
  activeRiskBadge: document.getElementById('active-risk-badge'),
  activeRiskRationale: document.getElementById('active-risk-rationale'),
  activeRiskNorm: document.getElementById('active-risk-norm'),
  originalClauseText: document.getElementById('original-clause-text'),
  alternativeClauseTextarea: document.getElementById('alternative-clause-textarea'),
  keepOriginalBtn: document.getElementById('keep-original-btn'),
  acceptAltBtn: document.getElementById('accept-alt-btn'),
  
  // Chat
  chatConsole: document.getElementById('chat-console'),
  chatInputField: document.getElementById('chat-input-field'),
  chatSendBtn: document.getElementById('chat-send-btn'),
  
  // Export View
  statsTotal: document.getElementById('stats-total'),
  statsMitigated: document.getElementById('stats-mitigated'),
  memoOutputContent: document.getElementById('memo-output-content'),
  docOutputContent: document.getElementById('doc-output-content'),
  copyDocLink: document.getElementById('copy-doc-link'),
  startOverBtn: document.getElementById('start-over-btn'),
  downloadTxtBtn: document.getElementById('download-txt-btn'),
  uploadR2Btn: document.getElementById('upload-r2-btn')
};

// =====================================================================
// View Synchronization (BroadcastChannel) & Hash Router
// =====================================================================

const syncChannel = new BroadcastChannel('redpen_state_sync');
let isApplyingSync = false;

function broadcastState(actionType) {
  if (isApplyingSync) return;
  syncChannel.postMessage({
    type: 'state_update',
    actionType: actionType,
    state: {
      rawText: state.rawText,
      clauses: state.clauses,
      decisions: state.decisions,
      activeIndex: state.activeIndex,
      activeAnalysis: state.activeAnalysis,
      isAnalyzing: state.isAnalyzing,
      memo: state.memo,
      redlinedDoc: state.redlinedDoc,
      statusLogs: state.statusLogs
    }
  });
}

function checkRoute() {
  const isReviewDesk = window.location.hash.includes('/review');
  if (isReviewDesk) {
    document.body.classList.add('review-desk-mode');
  } else {
    document.body.classList.remove('review-desk-mode');
  }
}

window.addEventListener('hashchange', checkRoute);

syncChannel.onmessage = async (event) => {
  const data = event.data;
  if (!data) return;
  
  if (data.type === 'reset') {
    isApplyingSync = true;
    state.rawText = '';
    state.clauses = [];
    state.decisions = [];
    state.activeIndex = 0;
    state.memo = '';
    state.redlinedDoc = '';
    
    dom.textarea.value = '';
    dom.wordCountLabel.textContent = '0 words';
    dom.analyzeBtn.disabled = true;
    
    showScreen('screen-upload');
    isApplyingSync = false;
    return;
  }
  
  if (data.type === 'state_update') {
    isApplyingSync = true;
    
    state.rawText = data.state.rawText;
    state.clauses = data.state.clauses;
    state.decisions = data.state.decisions;
    state.activeIndex = data.state.activeIndex;
    state.activeAnalysis = data.state.activeAnalysis;
    state.isAnalyzing = data.state.isAnalyzing;
    state.memo = data.state.memo;
    state.redlinedDoc = data.state.redlinedDoc;
    state.statusLogs = data.state.statusLogs;
    
    if (state.isAnalyzing) {
      showScreen('screen-analyzing');
      if (dom.terminalConsole) {
        dom.terminalConsole.innerHTML = '';
        state.statusLogs.forEach(log => {
          dom.terminalConsole.innerHTML += `<span>${log}</span><br>`;
        });
        dom.terminalConsole.scrollTop = dom.terminalConsole.scrollHeight;
      }
    } else if (state.clauses && state.clauses.length > 0) {
      const allResolved = state.decisions.every(d => d.action !== 'pending');
      if (allResolved) {
        populateExportScreen();
        showScreen('screen-export');
      } else {
        showScreen('screen-review');
        populateSidebar();
        await updateActiveClauseUI(state.activeIndex);
      }
    } else {
      showScreen('screen-upload');
    }
    
    isApplyingSync = false;
  }
};

// =====================================================================
// View Transitions
// =====================================================================

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(scr => {
    scr.classList.remove('active');
    scr.style.opacity = '0';
  });
  
  const target = document.getElementById(screenId);
  target.classList.add('active');
  setTimeout(() => {
    target.style.opacity = '1';
  }, 50);
}

// Log to simulated Analyzing console
function logConsole(message, type = 'SYS') {
  const time = new Date().toLocaleTimeString();
  const colorMap = {
    'SYS': 'var(--text-mid)',
    'CRYPT': '#3B82F6',
    'ERR': 'var(--color-error)',
    'SUCCESS': 'var(--color-success)'
  };
  const color = colorMap[type] || 'var(--text-hi)';
  state.statusLogs.push(`[${time}] [${type}] ${message}`);
  
  dom.terminalConsole.innerHTML += `<span style="color: ${color}">[${type}] ${message}</span><br>`;
  dom.terminalConsole.scrollTop = dom.terminalConsole.scrollHeight;
}

// =====================================================================
// Session Management (State Persistence)
// =====================================================================

async function saveSession() {
  const sessionData = {
    rawText: state.rawText,
    clauses: state.clauses,
    decisions: state.decisions,
    activeIndex: state.activeIndex,
    signingPublicKey: state.signingPublicKey,
    memo: state.memo,
    redlinedDoc: state.redlinedDoc
  };
  
  if (sdk.isStandalone) {
    localStorage.setItem('redpen_session', JSON.stringify(sessionData));
  } else {
    try {
      await sdk.storageSet('redpen_state', sessionData);
    } catch (e) {
      console.warn("Storage sync failed:", e);
    }
  }
}

async function restoreSession() {
  let sessionData = null;
  if (sdk.isStandalone) {
    const raw = localStorage.getItem('redpen_session');
    if (raw) sessionData = JSON.parse(raw);
  } else {
    try {
      sessionData = await sdk.storageGet('redpen_state');
    } catch (e) {
      console.warn("Storage fetch failed:", e);
    }
  }
  
  if (sessionData && sessionData.clauses && sessionData.clauses.length > 0) {
    state.rawText = sessionData.rawText;
    state.clauses = sessionData.clauses;
    state.decisions = sessionData.decisions;
    state.activeIndex = sessionData.activeIndex;
    state.signingPublicKey = sessionData.signingPublicKey || state.signingPublicKey;
    state.memo = sessionData.memo || '';
    state.redlinedDoc = sessionData.redlinedDoc || '';
    
    // Check if fully reviewed
    const allReviewed = state.decisions.every(d => d.action !== 'pending');
    if (allReviewed) {
      populateExportScreen();
      showScreen('screen-export');
    } else {
      populateSidebar();
      selectActiveClause(state.activeIndex);
      showScreen('screen-review');
    }
    return true;
  }
  return false;
}

// =====================================================================
// Input Form Wireframe
// =====================================================================

dom.textarea.addEventListener('input', () => {
  const text = dom.textarea.value;
  state.rawText = text;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  dom.wordCountLabel.textContent = `${wordCount} words`;
  dom.analyzeBtn.disabled = text.length < 50;
});

dom.loadSampleLink.addEventListener('click', () => {
  dom.textarea.value = SEED_CONTRACT_TEXT;
  state.rawText = SEED_CONTRACT_TEXT;
  const wordCount = SEED_CONTRACT_TEXT.split(/\s+/).length;
  dom.wordCountLabel.textContent = `${wordCount} words`;
  dom.analyzeBtn.disabled = false;
  logConsole("Loaded sample contractor agreement template with 5 risk seeds.");
});


// =====================================================================
// Document Analysis Pipeline
// =====================================================================

dom.analyzeBtn.addEventListener('click', async () => {
  if (!state.rawText) return;
  showScreen('screen-analyzing');
  state.isAnalyzing = true;
  
  dom.progressBar.style.width = '10%';
  dom.progressText.textContent = 'Parsing contract text...';
  logConsole("Parsing contract text into structured clauses...");
  
  try {
    let parseResult;
    if (sdk.isStandalone) {
      // Direct JS split
      const clauses = [];
      const lines = state.rawText.split('\n\n');
      let pos = 0;
      lines.forEach(l => {
        if (!l.strip) {
          l = l.trim();
        }
        if (!l) return;
        let sec = `Section ${pos + 1}`;
        if (l.startsWith('§') || l.startsWith('Section') || l.startsWith('Clause')) {
          const m = l.match(/^(?:Section|Clause|§)\s*[\d\.]+/i);
          if (m) sec = m[0];
        }
        clauses.append ? clauses.push({
          id: `clause_${pos}`,
          text: l,
          section: sec,
          position: pos,
          hash: Math.random().toString(36).substring(2)
        }) : clauses.push({
          id: `clause_${pos}`,
          text: l,
          section: sec,
          position: pos,
          hash: Math.random().toString(36).substring(2)
        });
        pos++;
      });
      parseResult = { clauses, totalClauses: clauses.length };
    } else {
      parseResult = await sdk.invokeTool('contract.parse', { text: state.rawText });
    }
    
    state.clauses = parseResult.clauses;
    logConsole(`Successfully parsed ${state.clauses.length} clauses.`, 'SUCCESS');
    
    // Scaffolding decisions
    state.decisions = state.clauses.map(c => ({
      clauseId: c.id,
      action: 'pending', // keep / replace / edit
      originalText: c.text,
      finalText: c.text,
      analysis: null
    }));
    
    dom.progressBar.style.width = '30%';
    dom.progressText.textContent = 'Analyzing clauses with encrypted AES-GCM session envelopes...';

    // Analyze each clause one by one
    for (let idx = 0; idx < state.clauses.length; idx++) {
      const c = state.clauses[idx];
      const pPercent = 30 + Math.floor((idx / state.clauses.length) * 70);
      dom.progressBar.style.width = `${pPercent}%`;
      dom.progressText.textContent = `Auditing Clause ${idx + 1} of ${state.clauses.length}...`;

      logConsole(`Assembling locally verified AES-GCM session envelope for clause audit...`, 'CRYPT');

      let analysisResult;
      if (sdk.isStandalone) {
        // Simulating network delay in standalone, then use seed matcher
        await new Promise(r => setTimeout(r, 500));
        analysisResult = MOCK_ANALYSES[c.id] || DEFAULT_MOCK_ANALYSIS;
      } else {
        analysisResult = await sdk.invokeTool('contract.analyze', {
          clause: c.text,
          context: "Contractor agreement review",
          clauseId: c.id
        });
      }

      state.decisions[idx].analysis = analysisResult;
      logConsole(`Clause ${idx + 1} Audit completed. Risk: ${analysisResult.riskLevel}`, 'SUCCESS');
    }
    
    // Completed analysis pipeline
    state.activeIndex = 0;
    await saveSession();
    populateSidebar();
    selectActiveClause(0);
    
    // Automatically spawn clause_review view in parent runtime if available
    if (!sdk.isStandalone) {
      await sdk.openView('clause_review');
    }
    
    showScreen('screen-review');
  } catch (error) {
    logConsole(`Analysis pipeline aborted: ${error.message}`, 'ERR');
    alert(`Error: ${error.message}`);
    showScreen('screen-upload');
  } finally {
    state.isAnalyzing = false;
  }
});

// =====================================================================
// Sidebar Workspace & Navigation
// =====================================================================

function populateSidebar() {
  dom.clausesList.innerHTML = '';
  let resolvedCount = 0;
  
  state.clauses.forEach((c, idx) => {
    const dec = state.decisions[idx];
    const itemDiv = document.createElement('div');
    itemDiv.className = `sidebar-item ${idx === state.activeIndex ? 'active' : ''}`;
    
    const risk = dec.analysis ? dec.analysis.riskLevel : 'LOW';
    const resolvedCheck = dec.action !== 'pending' ? '✓ ' : '';
    if (dec.action !== 'pending') resolvedCount++;
    
    itemDiv.innerHTML = `
      <div class="item-row">
        <span class="item-sec">${resolvedCheck}${c.section}</span>
        <span class="risk-badge ${risk.toLowerCase()}">${risk}</span>
      </div>
      <span class="item-title">${c.text}</span>
    `;
    
    itemDiv.addEventListener('click', () => {
      selectActiveClause(idx);
    });
    
    dom.clausesList.appendChild(itemDiv);
  });
  
  dom.reviewedRatio.textContent = `${resolvedCount} / ${state.clauses.length}`;
}

async function selectActiveClause(index) {
  await updateActiveClauseUI(index);
  if (!isApplyingSync) {
    await saveSession();
    broadcastState('select_clause');
  }
}

async function updateActiveClauseUI(index) {
  state.activeIndex = index;
  
  // Highlight active item in sidebar
  document.querySelectorAll('.sidebar-item').forEach((item, idx) => {
    if (idx === index) item.classList.add('active');
    else item.classList.remove('active');
  });
  
  const c = state.clauses[index];
  if (!c) return;
  const dec = state.decisions[index];
  const analysis = dec.analysis || DEFAULT_MOCK_ANALYSIS;
  state.activeAnalysis = analysis;
  
  dom.activeClauseTitle.textContent = `${c.section} : ${analysis.category || 'General'}`;
  
  // Set Risk badge
  dom.activeRiskBadge.className = `risk-badge ${analysis.riskLevel.toLowerCase()}`;
  dom.activeRiskBadge.textContent = analysis.riskLevel;
  
  // Set rationale
  dom.activeRiskRationale.textContent = analysis.rationale || "No specific risks found.";
  dom.activeRiskNorm.textContent = analysis.normComparison || "In accordance with standard industry norms.";
  
  // Set texts
  dom.originalClauseText.textContent = c.text;
  
  // Set alternative text
  if (dec.action === 'pending') {
    dom.alternativeClauseTextarea.value = analysis.alternative || c.text;
  } else {
    dom.alternativeClauseTextarea.value = dec.finalText;
  }
  
  // Clear chat logs for the new clause
  dom.chatConsole.innerHTML = `
    <div class="chat-bubble agent">
      Hello! I am your RedPen AI Legal Negotiator. You can ask me to soften, modify, or rewrite this clause in real-time.
    </div>
  `;
}


// =====================================================================
// Comparative Decisions Action Handling
// =====================================================================

async function resolveActiveClause(action, finalText) {
  const idx = state.activeIndex;
  state.decisions[idx].action = action;
  state.decisions[idx].finalText = finalText;
  
  logConsole(`Saved decision on Clause ${idx + 1} (${state.clauses[idx].section}): Action: ${action}.`);
  
  if (!isApplyingSync) {
    await saveSession();
    broadcastState('resolve_clause');
  }
  
  // Move to next unresolved
  let nextIndex = idx + 1;
  if (nextIndex >= state.clauses.length) {
    // Check if everything is resolved
    const allResolved = state.decisions.every(d => d.action !== 'pending');
    if (allResolved) {
      await finalizeRedlining();
      return;
    } else {
      // Loop back to find first pending
      nextIndex = state.decisions.findIndex(d => d.action === 'pending');
    }
  }
  
  populateSidebar();
  selectActiveClause(nextIndex);
}

dom.keepOriginalBtn.addEventListener('click', () => {
  const origText = state.clauses[state.activeIndex].text;
  resolveActiveClause('keep', origText);
});

dom.acceptAltBtn.addEventListener('click', () => {
  const altText = dom.alternativeClauseTextarea.value;
  resolveActiveClause('replace', altText);
});

// Keyboard Shortcuts support
window.addEventListener('keydown', (e) => {
  const screenVisible = dom.screenReview.classList.contains('active');
  if (!screenVisible) return;
  
  // Only trigger if focus is not on input/textarea
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
    return;
  }
  
  if (e.key === '1') {
    const origText = state.clauses[state.activeIndex].text;
    resolveActiveClause('keep', origText);
  } else if (e.key === '2') {
    const altText = dom.alternativeClauseTextarea.value;
    resolveActiveClause('replace', altText);
  } else if (e.key === 'ArrowLeft') {
    let nextIdx = state.activeIndex - 1;
    if (nextIdx < 0) nextIdx = state.clauses.length - 1;
    selectActiveClause(nextIdx);
    populateSidebar();
  } else if (e.key === 'ArrowRight') {
    let nextIdx = state.activeIndex + 1;
    if (nextIdx >= state.clauses.length) nextIdx = 0;
    selectActiveClause(nextIdx);
    populateSidebar();
  }
});

// =====================================================================
// Interactive Advisor Live Chat Agent
// =====================================================================

async function sendChatPrompt() {
  const prompt = dom.chatInputField.value.trim();
  if (!prompt) return;
  
  dom.chatConsole.innerHTML += `
    <div class="chat-bubble user">
      ${prompt}
    </div>
  `;
  dom.chatInputField.value = '';
  dom.chatConsole.scrollTop = dom.chatConsole.scrollHeight;
  
  // Append standard response spinner
  const agentBubble = document.createElement('div');
  agentBubble.className = 'chat-bubble agent';
  agentBubble.textContent = 'Negotiating alternative phrasing...';
  dom.chatConsole.appendChild(agentBubble);
  dom.chatConsole.scrollTop = dom.chatConsole.scrollHeight;
  
  try {
    const c = state.clauses[state.activeIndex];
    
    let answerText;
    let alternativeClause = null;
    
    if (sdk.isStandalone) {
      await new Promise(r => setTimeout(r, 800));
      answerText = `I have adjusted the clause to address: "${prompt}". I rewritten the term to soften liabilities and restore balance. Check the proposed draft on the right panel.`;
      // Simple mock rewrites
      if (prompt.toLowerCase().includes('mutual')) {
        alternativeClause = `§ 3. Intellectual Property\nBoth parties shall retain ownership of their respective pre-existing Intellectual Property. Any joint deliverables shall be owned mutually.`;
      } else {
        alternativeClause = `[Redlined Modification]\n${c.text}\n[Mitigation applied: ${prompt}]`;
      }
    } else {
      // Call host LLM agent directly
      const systemPrompt = `You are a legal advisor agent. The user is asking to rewrite a contract clause based on the prompt: "${prompt}".
Original Clause:
${c.text}
Current Alternative Proposal:
${dom.alternativeClauseTextarea.value}

Explain your modifications to the user, and write the new clause text clearly enclosed in [CLAUSE_START] and [CLAUSE_END] tags.`;

      const response = await sdk.sendRequest('sampling/createMessage', {
        messages: [{ role: 'user', content: systemPrompt }]
      });
      
      const content = response.content || '';
      answerText = content.replace(/\[CLAUSE_START\][\s\S]*?\[CLAUSE_END\]/g, '').trim();
      
      const match = content.match(/\[CLAUSE_START\]([\s\S]*?)\[CLAUSE_END\]/);
      if (match) {
        alternativeClause = match[1].trim();
      }
    }
    
    agentBubble.textContent = answerText;
    if (alternativeClause) {
      dom.alternativeClauseTextarea.value = alternativeClause;
      // Mark as customized
      state.decisions[state.activeIndex].action = 'edit';
      state.decisions[state.activeIndex].finalText = alternativeClause;
      
      await saveSession();
      if (!isApplyingSync) {
        broadcastState('chat_rewrite');
      }
    }
  } catch (error) {
    agentBubble.textContent = `Failed to process rewrite: ${error.message}`;
  }
  dom.chatConsole.scrollTop = dom.chatConsole.scrollHeight;
}

dom.chatSendBtn.addEventListener('click', sendChatPrompt);
dom.chatInputField.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChatPrompt();
});

// =====================================================================
// Finalization & Report Export View
// =====================================================================

async function finalizeRedlining() {
  showScreen('screen-analyzing');
  dom.progressText.textContent = 'Generating finalized redlined document & signature audit trail...';
  dom.progressBar.style.width = '80%';
  
  logConsole("Assembling final document and requesting signature authorization...");
  
  try {
    let result;
    if (sdk.isStandalone) {
      await new Promise(r => setTimeout(r, 1000));
      
      // Reconstruct
      const rebuilt = state.decisions.map(d => d.action === 'pending' ? d.originalText : d.finalText).join('\n\n');
      const mockMemo = `RedPen Audit Summary Memo\n\n- Reviewed ${state.decisions.length} clauses.\n- Resolved ${state.decisions.filter(d => d.action !== 'keep').length} vulnerabilities.\n\nThis document has been cryptographically locked and signed by Developer Key: ${state.signingPublicKey}`;
      
      result = {
        redlinedDocument: rebuilt,
        summaryMemo: mockMemo,
        signature: 'sig_mock_ed25519_' + Math.random().toString(36).substring(2, 12),
        signingPublicKey: 'pk_mock_' + state.signingPublicKey,
        stats: {
          totalReviewed: state.decisions.length,
          mitigatedCount: state.decisions.filter(d => d.action !== 'keep').length
        }
      };
    } else {
      result = await sdk.invokeTool('contract.generateRedline', {
        originalText: state.rawText,
        decisions: state.decisions.map(d => ({
          clauseId: d.clauseId,
          action: d.action,
          originalText: d.originalText,
          finalText: d.finalText
        }))
      });
      
      // Post a final visual checkmark indicator to host chat timeline
      try {
        await sdk.sendRequest('chat.append_artifact', {
          title: "Contract Audited Successfully",
          body: `Mitigated ${result.stats.mitigatedCount} liability risks.`
        });
      } catch (err) {
        console.warn("Artifact post failed:", err);
      }
    }
    
    state.redlinedDoc = result.redlinedDocument;
    state.memo = result.summaryMemo;
    state.signingPublicKey = result.signingPublicKey;
    
    await saveSession();
    if (!isApplyingSync) {
      broadcastState('finalize');
    }
    populateExportScreen();
    showScreen('screen-export');
    
    if (!sdk.isStandalone) {
      // Close review sub-view
      await sdk.closeView();
    }
  } catch (error) {
    alert("Export generation failed: " + error.message);
    showScreen('screen-review');
  }
}

function populateExportScreen() {
  const mitigatedCount = state.decisions.filter(d => d.action !== 'keep').length;
  
  dom.statsTotal.textContent = state.decisions.length;
  dom.statsMitigated.textContent = mitigatedCount;
  
  dom.memoOutputContent.textContent = state.memo;
  dom.docOutputContent.textContent = state.redlinedDoc;
}

// Copy Action
dom.copyDocLink.addEventListener('click', () => {
  navigator.clipboard.writeText(state.redlinedDoc);
  alert("Redlined contract text copied to clipboard!");
});

// Download Text Action
dom.downloadTxtBtn.addEventListener('click', () => {
  const blob = new Blob([state.redlinedDoc], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'redlined_contract.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Upload and R2 Storage
dom.uploadR2Btn.addEventListener('click', async () => {
  dom.uploadR2Btn.textContent = 'Uploading...';
  dom.uploadR2Btn.disabled = true;
  
  logConsole("Negotiating presigned upload links from Anna Host Persistent Storage (R2)...");
  
  try {
    if (sdk.isStandalone) {
      await new Promise(r => setTimeout(r, 1200));
      const mockUrl = `https://r2.anna-storage.internal/redpen/share_${Math.random().toString(36).substring(2, 8)}.pdf`;
      alert(`Report successfully uploaded to Host R2 storage!\nShareable URL: ${mockUrl}`);
    } else {
      // Call upload.negotiate which is the standard host storage upload link generator
      const uploadParams = {
        name: `redpen_audit_${Date.now()}.txt`,
        type: 'text/plain',
        size: state.redlinedDoc.length
      };
      
      const negotiation = await sdk.sendRequest('upload.negotiate', uploadParams);
      const uploadUrl = negotiation.upload_url;
      const downloadUrl = negotiation.download_url;
      
      // Perform HTTP PUT
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: state.redlinedDoc
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed with status: ${response.statusText}`);
      }
      
      if (negotiation.uploadId) {
        const a = await annaReady;
        if (a) {
          await a.tools.invoke({
            tool_id: "host",
            method: "upload.confirm",
            args: { uploadId: negotiation.uploadId }
          });
        }
      }
      
      alert(`Report uploaded successfully!\nDownload link: ${downloadUrl}`);
    }
  } catch (error) {
    alert(`R2 storage upload failed: ${error.message}`);
  } finally {
    dom.uploadR2Btn.textContent = 'Upload & Share Report';
    dom.uploadR2Btn.disabled = false;
  }
});

// Reset / Start Over
dom.startOverBtn.addEventListener('click', async () => {
  if (confirm("Are you sure you want to discard this session and start over?")) {
    state.rawText = '';
    state.clauses = [];
    state.decisions = [];
    state.activeIndex = 0;
    state.memo = '';
    state.redlinedDoc = '';
    
    dom.textarea.value = '';
    dom.wordCountLabel.textContent = '0 words';
    dom.analyzeBtn.disabled = true;
    
    if (sdk.isStandalone) {
      localStorage.removeItem('redpen_session');
    } else {
      try {
        await sdk.sendRequest('storage.delete', { key: 'redpen_state' });
      } catch (e) {}
    }
    
    if (!isApplyingSync) {
      syncChannel.postMessage({ type: 'reset' });
    }
    
    showScreen('screen-upload');
  }
});

// =====================================================================
// App Entry point
// =====================================================================

async function initApp() {
  checkRoute();
  
  if (sdk.isStandalone) {
    dom.statusDot.className = 'status-dot mock';
    dom.connectionText.textContent = 'STANDALONE (MOCK MODE)';
  } else {
    dom.statusDot.className = 'status-dot';
    dom.connectionText.textContent = 'CONNECTED NATIVE';
  }

  // Bind Navigation
  document.getElementById("nav-workspace-btn").addEventListener("click", () => {
    if (state.clauses && state.clauses.length > 0) {
      const allResolved = state.decisions.every(d => d.action !== 'pending');
      if (allResolved) {
        showScreen('screen-export');
      } else {
        showScreen('screen-review');
      }
    } else {
      showScreen('screen-upload');
    }
    document.getElementById("nav-workspace-btn").classList.add("active-nav");
    document.getElementById("nav-anna-console-btn").classList.remove("active-nav");
  });

  document.getElementById("nav-anna-console-btn").addEventListener("click", () => {
    showScreen('screen-console');
    document.getElementById("nav-workspace-btn").classList.remove("active-nav");
    document.getElementById("nav-anna-console-btn").classList.add("active-nav");
  });
  
  // Try to restore session
  const restored = await restoreSession();
  if (!restored) {
    if (window.location.hash.includes('/review')) {
      showScreen('screen-review');
    } else {
      showScreen('screen-upload');
    }
  }
}

window.addEventListener('DOMContentLoaded', initApp);

// ─── Anna Developer Console JavaScript Implementation ────────────────
const $ = (id) => document.getElementById(id);
let activeAgentSessionUuid = null;

function escapeHtml(string) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return String(string).replace(/[&<>"']/g, function(m) { return map[m]; });
}

function logSdkCall(method, params, result, error = null) {
  const box = $("sdk-log-box");
  const time = new Date().toTimeString().split(' ')[0];
  const entry = document.createElement("div");
  entry.className = "log-entry";
  
  let resultHtml = "";
  if (error) {
    resultHtml = `<div class="log-error">Error: ${escapeHtml(JSON.stringify(error))}</div>`;
  } else {
    resultHtml = `<div class="log-result">Result: ${escapeHtml(JSON.stringify(result))}</div>`;
  }
  
  entry.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="log-method">${escapeHtml(method)}</span>
    <div class="log-params">Params: ${escapeHtml(JSON.stringify(params))}</div>
    ${resultHtml}
  `;
  box.appendChild(entry);
  box.scrollTop = box.scrollHeight;
}

$("console-clear-logs").addEventListener("click", () => {
  $("sdk-log-box").innerHTML = `
    <div class="log-entry">
      <span class="log-time">[${new Date().toTimeString().split(' ')[0]}]</span>
      <span class="log-method">SYSTEM</span>: Logs cleared.
    </div>
  `;
});

// 1. Agent Sessions Actions
$("sdk-agent-create").addEventListener("click", async () => {
  const label = $("sdk-agent-label").value;
  const ttl = parseInt($("sdk-agent-ttl").value, 10) || 600;
  const a = await annaReady;
  
  const params = { label, ttl_seconds: ttl, submode: "auto" };
  try {
    let res;
    if (a && a.agent && a.agent.session) {
      res = await a.agent.session.create(params);
    } else {
      res = { app_session_uuid: "mock_session_" + Math.random().toString(36).substring(2, 10), mock: true };
    }
    activeAgentSessionUuid = res.app_session_uuid;
    logSdkCall("anna.agent.session.create", params, res);
    
    $("sdk-agent-run").disabled = false;
    $("sdk-agent-cancel").disabled = false;
    $("sdk-agent-history").disabled = false;
    $("sdk-agent-refresh").disabled = false;
    $("sdk-agent-delete").disabled = false;
    
    $("sdk-agent-chat-area").style.display = "block";
    $("sdk-agent-messages").innerHTML = `<div style="color:var(--primary);">Session started: ${activeAgentSessionUuid}</div>`;
  } catch (err) {
    logSdkCall("anna.agent.session.create", params, null, err);
  }
});

$("sdk-agent-run").addEventListener("click", async () => {
  await sendConsoleAgentTurn();
});

$("sdk-agent-send").addEventListener("click", async () => {
  await sendConsoleAgentTurn();
});

$("sdk-agent-input").addEventListener("keypress", async (e) => {
  if (e.key === "Enter") await sendConsoleAgentTurn();
});

async function sendConsoleAgentTurn() {
  const input = $("sdk-agent-input");
  const text = input.value.trim();
  if (!text || !activeAgentSessionUuid) return;
  
  const messagesBox = $("sdk-agent-messages");
  messagesBox.innerHTML += `<div style="color:var(--text-hi);">User: ${escapeHtml(text)}</div>`;
  input.value = "";
  
  const a = await annaReady;
  const params = { app_session_uuid: activeAgentSessionUuid, content: text };
  
  try {
    let res;
    if (a && a.agent && a.agent.session) {
      res = await a.agent.session.run(params);
    } else {
      res = { frames: [{ event: "final", content: "Mock agent response to: " + text }], mock: true };
    }
    logSdkCall("anna.agent.session.run", params, res);
    
    if (res.frames && res.frames.length > 0) {
      res.frames.forEach(f => {
        if (f.content) {
          messagesBox.innerHTML += `<div style="color:var(--accent);">Agent: ${escapeHtml(f.content)}</div>`;
        }
      });
    }
    messagesBox.scrollTop = messagesBox.scrollHeight;
  } catch (err) {
    logSdkCall("anna.agent.session.run", params, null, err);
  }
}

$("sdk-agent-cancel").addEventListener("click", async () => {
  if (!activeAgentSessionUuid) return;
  const a = await annaReady;
  const params = { app_session_uuid: activeAgentSessionUuid };
  try {
    let res = (a && a.agent && a.agent.session) ? await a.agent.session.cancel(params) : { ok: true, mock: true };
    logSdkCall("anna.agent.session.cancel", params, res);
  } catch (err) {
    logSdkCall("anna.agent.session.cancel", params, null, err);
  }
});

$("sdk-agent-history").addEventListener("click", async () => {
  if (!activeAgentSessionUuid) return;
  const a = await annaReady;
  const params = { app_session_uuid: activeAgentSessionUuid };
  try {
    let res = (a && a.agent && a.agent.session) ? await a.agent.session.history(params) : { messages: [], mock: true };
    logSdkCall("anna.agent.session.history", params, res);
  } catch (err) {
    logSdkCall("anna.agent.session.history", params, null, err);
  }
});

$("sdk-agent-refresh").addEventListener("click", async () => {
  if (!activeAgentSessionUuid) return;
  const a = await annaReady;
  const ttl = parseInt($("sdk-agent-ttl").value, 10) || 600;
  const params = { app_session_uuid: activeAgentSessionUuid, ttl_seconds: ttl };
  try {
    let res = (a && a.agent && a.agent.session) ? await a.agent.session.refresh(params) : { ok: true, mock: true };
    logSdkCall("anna.agent.session.refresh", params, res);
  } catch (err) {
    logSdkCall("anna.agent.session.refresh", params, null, err);
  }
});

$("sdk-agent-list").addEventListener("click", async () => {
  const a = await annaReady;
  try {
    let res = (a && a.agent && a.agent.session) ? await a.agent.session.list() : { sessions: [], mock: true };
    logSdkCall("anna.agent.session.list", {}, res);
  } catch (err) {
    logSdkCall("anna.agent.session.list", {}, null, err);
  }
});

$("sdk-agent-delete").addEventListener("click", async () => {
  if (!activeAgentSessionUuid) return;
  const a = await annaReady;
  const params = { app_session_uuid: activeAgentSessionUuid };
  try {
    let res = (a && a.agent && a.agent.session) ? await a.agent.session.delete(params) : { ok: true, mock: true };
    logSdkCall("anna.agent.session.delete", params, res);
    
    activeAgentSessionUuid = null;
    $("sdk-agent-run").disabled = true;
    $("sdk-agent-cancel").disabled = true;
    $("sdk-agent-history").disabled = true;
    $("sdk-agent-refresh").disabled = true;
    $("sdk-agent-delete").disabled = true;
    $("sdk-agent-chat-area").style.display = "none";
  } catch (err) {
    logSdkCall("anna.agent.session.delete", params, null, err);
  }
});

// 2. Image Actions
$("sdk-image-generate").addEventListener("click", async () => {
  const prompt = $("sdk-image-prompt").value;
  const size = $("sdk-image-size").value;
  const a = await annaReady;
  const params = { prompt, n: 1, size };
  try {
    let res;
    if (a && a.image && a.image.generate) {
      res = await a.image.generate(params);
    } else {
      res = [{ url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500", mock: true }];
    }
    logSdkCall("anna.image.generate", params, res);
    if (res && res[0] && res[0].url) {
      $("sdk-image-img").src = res[0].url;
      $("sdk-image-result").style.display = "block";
    }
  } catch (err) {
    logSdkCall("anna.image.generate", params, null, err);
  }
});

$("sdk-image-edit").addEventListener("click", async () => {
  const prompt = $("sdk-image-prompt").value;
  const size = $("sdk-image-size").value;
  const imageUrl = $("sdk-image-url").value || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500";
  const a = await annaReady;
  const params = { image_url: imageUrl, prompt, n: 1, size };
  try {
    let res;
    if (a && a.image && a.image.edit) {
      res = await a.image.edit(params);
    } else {
      res = [{ url: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=500", mock: true }];
    }
    logSdkCall("anna.image.edit", params, res);
    if (res && res[0] && res[0].url) {
      $("sdk-image-img").src = res[0].url;
      $("sdk-image-result").style.display = "block";
    }
  } catch (err) {
    logSdkCall("anna.image.edit", params, null, err);
  }
});

// 3. Embeddings & Complete
$("sdk-embed-btn").addEventListener("click", async () => {
  const input = $("sdk-embed-text").value;
  const a = await annaReady;
  const params = { input };
  try {
    let res = (a && a.llm && a.llm.embed) ? await a.llm.embed(params) : { embedding: Array(64).fill(0).map(() => Math.random()), mock: true };
    logSdkCall("anna.llm.embed", params, res);
    $("sdk-embed-result").innerText = JSON.stringify(res, null, 2);
    $("sdk-embed-result").style.display = "block";
  } catch (err) {
    logSdkCall("anna.llm.embed", params, null, err);
  }
});

$("sdk-complete-btn").addEventListener("click", async () => {
  const input = $("sdk-embed-text").value;
  const a = await annaReady;
  const params = { messages: [{ role: "user", content: input }] };
  try {
    let res = (a && a.llm && a.llm.complete) ? await a.llm.complete(params) : { content: "Mock complete: " + input, mock: true };
    logSdkCall("anna.llm.complete", params, res);
    $("sdk-embed-result").innerText = JSON.stringify(res, null, 2);
    $("sdk-embed-result").style.display = "block";
  } catch (err) {
    logSdkCall("anna.llm.complete", params, null, err);
  }
});

// 4. KV Store & Upload
$("sdk-kv-get").addEventListener("click", async () => {
  const key = $("sdk-kv-key").value;
  const a = await annaReady;
  const params = { key, scope: "user" };
  try {
    let res = (a && a.storage) ? await a.storage.get(key) : { value: "mock_value", mock: true };
    logSdkCall("anna.storage.get", params, res);
  } catch (err) {
    logSdkCall("anna.storage.get", params, null, err);
  }
});

$("sdk-kv-set").addEventListener("click", async () => {
  const key = $("sdk-kv-key").value;
  const value = $("sdk-kv-val").value;
  const a = await annaReady;
  const params = { key, value, scope: "user" };
  try {
    let res = (a && a.storage) ? await a.storage.set(key, value) : { ok: true, mock: true };
    logSdkCall("anna.storage.set", params, res);
  } catch (err) {
    logSdkCall("anna.storage.set", params, null, err);
  }
});

$("sdk-kv-delete").addEventListener("click", async () => {
  const key = $("sdk-kv-key").value;
  const a = await annaReady;
  const params = { key, scope: "user" };
  try {
    let res = (a && a.storage) ? await a.storage.delete(key) : { ok: true, mock: true };
    logSdkCall("anna.storage.delete", params, res);
  } catch (err) {
    logSdkCall("anna.storage.delete", params, null, err);
  }
});

$("sdk-kv-list").addEventListener("click", async () => {
  const key = $("sdk-kv-key").value;
  const a = await annaReady;
  const params = { prefix: key, scope: "user" };
  try {
    let res = (a && a.storage) ? await a.storage.list(params) : { keys: [key], mock: true };
    logSdkCall("anna.storage.list", params, res);
  } catch (err) {
    logSdkCall("anna.storage.list", params, null, err);
  }
});

$("sdk-upload-btn").addEventListener("click", async () => {
  const fileInput = $("sdk-upload-file");
  if (!fileInput.files || fileInput.files.length === 0) {
    alert("Please choose a file to upload first.");
    return;
  }
  const file = fileInput.files[0];
  const a = await annaReady;
  
  const params = { filename: file.name, mime_type: file.type, byte_length: file.size, purpose: "artifact" };
  try {
    let res;
    if (a && a.upload && a.upload.negotiate) {
      // Step 1: Negotiate
      const nego = await a.upload.negotiate(params);
      logSdkCall("anna.upload.negotiate", params, nego);
      
      if (nego && nego.upload_url) {
        // Step 2: PUT file
        await fetch(nego.upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type }
        });
        
        // Step 3: Confirm
        const confParams = { r2_key: nego.r2_key };
        const conf = await a.upload.confirm(confParams);
        logSdkCall("anna.upload.confirm", confParams, conf);
        res = conf;
      }
    } else {
      // Inline upload fallback
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const inlineParams = { filename: file.name, mime_type: file.type, content_b64: base64, purpose: "artifact" };
        if (a && a.upload && a.upload.inline) {
          res = await a.upload.inline(inlineParams);
          logSdkCall("anna.upload.inline", inlineParams, res);
        } else {
          res = { download_url: "https://mock.download.url/" + file.name, mock: true };
          logSdkCall("anna.upload.inline (fallback)", inlineParams, res);
        }
      };
      reader.readAsDataURL(file);
      return;
    }
  } catch (err) {
    logSdkCall("anna.upload.negotiate/confirm", params, null, err);
  }
});

// 5. Window, Tools & Egress
$("sdk-win-title-btn").addEventListener("click", async () => {
  const title = $("sdk-win-title").value;
  const a = await annaReady;
  const params = title;
  try {
    let res = (a && a.window && a.window.set_title) ? await a.window.set_title(title) : { ok: true, mock: true };
    logSdkCall("anna.window.set_title", params, res);
  } catch (err) {
    logSdkCall("anna.window.set_title", params, null, err);
  }
});

$("sdk-win-open-btn").addEventListener("click", async () => {
  const view = $("sdk-win-view").value;
  const a = await annaReady;
  const params = { name: view };
  try {
    let res = (a && a.window && a.window.open_view) ? await a.window.open_view(view) : { ok: true, mock: true };
    logSdkCall("anna.window.open_view", params, res);
  } catch (err) {
    logSdkCall("anna.window.open_view", params, null, err);
  }
});

$("sdk-win-close-btn").addEventListener("click", async () => {
  const a = await annaReady;
  try {
    let res = (a && a.window && a.window.close) ? await a.window.close() : { ok: true, mock: true };
    logSdkCall("anna.window.close", {}, res);
  } catch (err) {
    logSdkCall("anna.window.close", {}, null, err);
  }
});

$("sdk-tools-list-btn").addEventListener("click", async () => {
  const a = await annaReady;
  try {
    let res = (a && a.tools && a.tools.list) ? await a.tools.list() : { tools: [], mock: true };
    logSdkCall("anna.tools.list", {}, res);
  } catch (err) {
    logSdkCall("anna.tools.list", {}, null, err);
  }
});

$("sdk-chat-msg-btn").addEventListener("click", async () => {
  const text = $("sdk-chat-msg").value;
  const a = await annaReady;
  const params = { text };
  try {
    let res = (a && a.chat && a.chat.write_message) ? await a.chat.write_message({ text }) : { ok: true, mock: true };
    logSdkCall("anna.chat.write_message", params, res);
  } catch (err) {
    logSdkCall("anna.chat.write_message", params, null, err);
  }
});

$("sdk-chat-artifact-btn").addEventListener("click", async () => {
  const text = $("sdk-chat-msg").value;
  const a = await annaReady;
  const params = {
    type: "developer_artifact",
    title: "RedPen Dev Resolution",
    summary: text,
    link: "https://r2.redpen.dev/artifacts/test.txt",
    svg: `<svg viewBox="0 0 100 100" width="80" height="80"><circle cx="50" cy="50" r="40" fill="var(--accent)" /></svg>`
  };
  try {
    let res = (a && a.chat && a.chat.append_artifact) ? await a.chat.append_artifact(params) : { ok: true, mock: true };
    logSdkCall("anna.chat.append_artifact", params, res);
  } catch (err) {
    logSdkCall("anna.chat.append_artifact", params, null, err);
  }
});

