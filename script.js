// --- script.js (Refactored and Organized) ---

// ==================================
// == Configuration & Global State ==
// ==================================
const CONFIG = {
    // !!! IMPORTANT: Replace with your actual Zeabur node!!!
    gasWebAppUrl: 'https://proxy-deepmedai.zeabur.app/proxy',
    reportCheckIntervalSeconds: 30,
    pdfOptions: {
        margin:       [0.5, 0.5, 0.5, 0.5], // inches [top, right, bottom, left]
        filename:     'Final report.pdf', // Default filename, will be updated
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false }, // Added logging: false
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    }
};

let state = {
    currentUserProfile: null,
    currentUserIdToken: null, // 全局變數，用於儲存從 Google 登入獲得的原始 ID Token
    currentReportContent: null, // Store raw content for potential reuse
    knownReadyIDs: new Set(),
    isInitialStatusLoad: true,
    reportCheckIntervalId: null
};

// ==================================
// == Helper Functions ==
// ==================================

function parseJwt(token) {
    try {
        return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch (e) {
        console.error("Error parsing JWT:", e);
        return null;
    }
}

// ========================================
// == Google Sign-In Callback (Global) ==
// ========================================
// This function MUST be global because it's called by the GSI library
function handleCredentialResponse(response) {
    console.log("Google Sign-In Response Received.");
    try {
        // Decode the JWT token to get user profile information
        // Note: Basic decoding; for production, verify the token on your backend
        currentUserIdToken = response.credential; // 儲存原始 Token
        const jwtPayload = JSON.parse(atob(response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        state.currentUserProfile = jwtPayload;
        console.log("User profile:", { name: state.currentUserProfile.name, email: state.currentUserProfile.email }); // Log essential info
        updateLoginUI(true);
        // You might want to store the login state (e.g., in localStorage)
        // or send the token to your backend for verification/session creation here.

        // ✅ 在這裡！發送記錄 email 的請求
        fetch('https://proxy-deepmedai.zeabur.app/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                action: 'recordEmail',
                idToken: currentUserIdToken
            })
        })
        .then(res => res.json())
        .then(data => console.log('Email record result:', data))
        .catch(err => console.error('Error recording email:', err));

    } catch (e) {
        console.error("Error decoding JWT or processing sign-in:", e);
        state.currentUserProfile = null;
        currentUserIdToken = null; // 清除 Token
        updateLoginUI(false);
    }
}

// ==================================
// == UI Update Functions ==
// ==================================
function updateLoginUI(isLoggedIn) {
    // Get buttons each time, in case they are dynamically added/removed (though unlikely here)
    const googleSigninDiv = document.getElementById('g_id_signin');
    const signoutButton = document.getElementById('signout_button');
    const manualViewButton = document.getElementById('manual-view-report-button'); // *** 新增 ***

    console.log(`Updating login UI. Is logged in: ${isLoggedIn}`);

    if (isLoggedIn && state.currentUserProfile) {
        if (googleSigninDiv) googleSigninDiv.style.display = 'none'; // 登入後隱藏 Google 按鈕
        if (signoutButton) signoutButton.style.display = 'inline-block'; // 顯示登出按鈕
        if (manualViewButton) manualViewButton.style.display = 'inline-block'; // *** 登入後顯示手動按鈕 ***
        console.log(`Showing Sign Out for & Manual View Button ${state.currentUserProfile.name}`);
    } else {
        if (googleSigninDiv) googleSigninDiv.style.display = 'block'; // 登出後顯示 Google 按鈕 (用 block 或 inline-block，取決於佈局)
        if (signoutButton) signoutButton.style.display = 'none'; // 隱藏登出按鈕
        if (manualViewButton) manualViewButton.style.display = 'none'; // *** 登出後隱藏手動按鈕 ***
        console.log("Showing Google Sign In button.");
    }
}

/* function showNotification(elements) {
    if (elements.notificationBar) {
         elements.notificationBar.classList.add('visible');
         console.log("Notification shown.");
    } else { console.warn("Notification bar element not found."); }
} */

/* function hideNotification(elements) {
    if (elements.notificationBar) {
        elements.notificationBar.classList.remove('visible');
        console.log("Notification hidden.");
    } else { console.warn("Notification bar element not found."); }
} */
function showModal(elements) {
    if (elements.modalOverlay) {
        elements.modalOverlay.classList.add('visible');
        console.log("Modal shown.");
    } else { console.warn("Modal overlay element not found."); }
}
function hideModal(elements) {
    if (elements.modalOverlay) {
        elements.modalOverlay.classList.remove('visible');
        console.log("Modal hidden.");
        // Clear content after transition ends for smoother effect
        setTimeout(() => {
            // Double-check if still hidden before clearing
            if (elements.modalOverlay && !elements.modalOverlay.classList.contains('visible')) {
                 if (elements.modalBody) elements.modalBody.innerHTML = '';
                 if (elements.downloadPdfButton) elements.downloadPdfButton.disabled = true;
                 // *** 修改點：關閉 Modal 時清除錯誤訊息 ***
                 if (elements.modalErrorMessage) {
                    elements.modalErrorMessage.textContent = '';
                    elements.modalErrorMessage.style.display = 'none';
                 }
                 // *** (可選) 隱藏重試按鈕
                 if (elements.retryReportButton) elements.retryReportButton.style.display = 'none';
                 state.currentReportContent = null; // Clear stored content
                 console.log("Modal content cleared.");
            }
        }, 350); // Match transition duration (approx)
    } else { console.warn("Modal overlay element not found."); }
}

// Fixed: Correct HTML escaping
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
        console.warn("escapeHtml called with non-string:", unsafe);
        unsafe = String(unsafe);
    }
    return unsafe
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "'"); // Use ' for better compatibility than '
}

// --- Report Fetching/Display Logic ---
function fetchAndShowSpecificReport(requestID, elements) {
    console.log("Attempting to fetch report via MVP logic...");

    if (!requestID) {
        console.warn("fetchAndShowSpecificReport called with no requestID.");
        return;
    }

    if (!CONFIG.gasWebAppUrl || CONFIG.gasWebAppUrl.includes('YOUR_ACTUAL_GAS_WEB_APP_URL')) {
        console.error("Cannot fetch report: GAS Web App URL not configured.");
        alert("Application configuration error. Cannot fetch report.");
        return;
    }

    if (!elements.modalBody || !elements.modalOverlay) {
        console.error("Cannot show report: Modal elements not found.");
        return;
    }

    const url = CONFIG.gasWebAppUrl;
    console.log(`Fetching report with ID: ${requestID} for logged-in user.`);

    if (!state.currentUserProfile || !currentUserIdToken) {
        alert("Please log in to view reports.");
        return;
    }

    // 清除之前的錯誤訊息
    if (elements.modalErrorMessage) {
        elements.modalErrorMessage.textContent = '';
        elements.modalErrorMessage.style.display = 'none';
    }

    // 隱藏重試按鈕
    if (elements.retryReportButton) elements.retryReportButton.style.display = 'none';

    // 顯示加載狀態
    elements.modalBody.innerHTML = '<p class="text-center py-4">Loading report...</p>';
    if (elements.downloadPdfButton) elements.downloadPdfButton.disabled = true;
    showModal(elements);

    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            action: 'getReport',
            requestID: requestID,
            idToken: currentUserIdToken
        })
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    })
    .then(data => {
        console.log("Report Fetch Response:", data);

        if (data.error) {
            console.error('Error fetching report:', data.error);
            elements.modalBody.innerHTML = ''; // 清空加載狀態
            if (elements.modalErrorMessage) {
                elements.modalErrorMessage.textContent = `Error: ${escapeHtml(data.error)}. Please check the ID and try again.`;
                elements.modalErrorMessage.style.display = 'block';
            }
            if (elements.retryReportButton) elements.retryReportButton.style.display = 'inline-block';
        } else if (data.reportContent) {
            // 成功獲取報告內容
            state.currentReportContent = data.reportContent;

            // 使用 Marked.js 渲染 Markdown
            if (typeof marked !== 'undefined') {
                try {
                    elements.modalBody.innerHTML = marked.parse(state.currentReportContent);
                    console.log("Report content rendered using Marked.");
                } catch (e) {
                    console.error("Error parsing Markdown with Marked:", e);
                    elements.modalBody.innerHTML = `<pre>${escapeHtml(state.currentReportContent)}</pre>`;
                }
            } else {
                console.warn("Marked library not found. Displaying raw text.");
                elements.modalBody.innerHTML = `<pre>${escapeHtml(state.currentReportContent)}</pre>`;
            }

            // 啟用下載按鈕
            if (state.currentReportContent.trim() !== "") {
                if (elements.downloadPdfButton) {
                    elements.downloadPdfButton.disabled = false;
                    CONFIG.pdfOptions.filename = `report-${requestID}-${Date.now()}.pdf`;
                }
            } else {
                console.warn("Fetched report content is empty.");
                elements.modalBody.innerHTML = '<p class="text-center py-4 text-red-600">Report is empty.</p>';
                if (elements.downloadPdfButton) elements.downloadPdfButton.disabled = true;
            }
        } else {
            console.warn(`Report content for ID ${requestID} is null or undefined.`);
            elements.modalBody.innerHTML = '<p class="text-center py-4 text-red-600">Report not found or is empty. Please check the ID and try again.</p>';
            if (elements.retryReportButton) elements.retryReportButton.style.display = 'inline-block';
            state.currentReportContent = null;
        }
    })
    .catch(error => {
        console.error('Error fetching report:', error);
        elements.modalBody.innerHTML = '<p class="text-center py-4 text-red-600">An error occurred while fetching the report. Please try again later.</p>';
        if (elements.modalErrorMessage) {
            elements.modalErrorMessage.textContent = `Error: ${escapeHtml(error.message)}. Please try again later.`;
            elements.modalErrorMessage.style.display = 'block';
        }
        state.currentReportContent = null;
    });
}

// --- ID Prompt Logic ---
function promptForReportID(elements) {
    const userEnteredID = prompt("Please enter your Report Request ID:");
    if (userEnteredID === null) { // User clicked 'Cancel'
        console.log("User cancelled entering Report ID.");
        return;
    }
    const trimmedID = userEnteredID.trim();
    if (trimmedID !== '') {
        fetchAndShowSpecificReport(trimmedID, elements);
    } else {
        alert("Invalid ID entered. Please enter a valid Report Request ID.");
        // Optionally re-prompt immediately:
        // setTimeout(() => promptForReportID(elements), 100);
    }
}

// --- Sign Out Logic ---
function handleSignOut(elements) {
    console.log("Handling Sign Out...");
    state.currentUserProfile = null;
    // *** 新增：清除儲存的 ID Token ***
    currentUserIdToken = null;
    // Optional: Clear any stored login state (e.g., from localStorage)
    // localStorage.removeItem('userLoginToken');

    // Optional: If using Google's automatic sign-in or One Tap, disable it
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
         google.accounts.id.disableAutoSelect();
         console.log("Google auto sign-in disabled.");
    }

    updateLoginUI(false); // Update UI to show Sign In button

    // *** 新增：登出時清除計時器 ***
    // if (state.reportCheckIntervalId) {
    //     clearInterval(state.reportCheckIntervalId);
    //     state.reportCheckIntervalId = null;
    //     console.log("Report check interval stopped on sign out.");
    // }
    // // 清空已知 ID，避免下次登入時顯示舊通知
    // state.knownReadyIDs.clear();
    // state.isInitialStatusLoad = true; // 重置初始加載狀態
    // // 可能也需要隱藏通知欄
    // hideNotification(elements);

    console.log("User signed out.");

}

// --- PDF Download Logic ---
function downloadReportAsPDF(elements) {
    const filename = CONFIG.pdfOptions.filename || `report-${Date.now()}.pdf`; // Use configured or default name

    if (!elements.modalBody || elements.modalBody.innerHTML.trim() === '' || elements.modalBody.textContent.includes('Loading report...')) {
         alert("No valid report content available to download.");
         console.warn("PDF download attempt with no/invalid content.");
         return;
    }
    if (typeof html2pdf === 'undefined') {
        alert("PDF generation library (html2pdf) is not loaded. Cannot download.");
        console.error("html2pdf library not found.");
        return;
    }
     if (!elements.downloadPdfButton) {
         console.warn("Download button element not found.");
         return; // Should ideally exist if this function is called
     }


    console.log(`Generating PDF: ${filename}`);
    elements.downloadPdfButton.disabled = true;
    elements.downloadPdfButton.textContent = 'Generating...';

    // Choose the source element for the PDF
    const contentToPrint = elements.modalBody;

    // Use html2pdf library
    html2pdf()
        .set(CONFIG.pdfOptions) // Apply configured options
        .from(contentToPrint)   // Specify the source element
        .save(filename)         // Trigger download with the filename
        .then(() => {
            console.log("PDF generated successfully.");
        })
        .catch(err => {
            console.error("Error generating PDF:", err);
            alert("Sorry, an error occurred while generating the PDF.");
        })
        .finally(() => {
            // Re-enable the button regardless of success or failure
             if (elements.downloadPdfButton) {
                elements.downloadPdfButton.disabled = false;
                elements.downloadPdfButton.textContent = 'Download as PDF';
             }
        });
}

// 輔助函數：獲取 UI 元素 (避免重複 getElementById)
function getUIElements() {
    return {
        // notificationBar: document.getElementById('new-report-notification'),
        // viewReportButton: document.getElementById('view-report-button'),
        modalOverlay: document.getElementById('report-modal-overlay'),
        modalBody: document.getElementById('report-modal-body'),
        closeModalButton: document.getElementById('close-report-modal'),
        downloadPdfButton: document.getElementById('download-pdf-button'),
        googleSigninDiv: document.getElementById('g_id_signin'),
        signoutButton: document.getElementById('signout_button'),
        header: document.querySelector("header"),
        modalErrorMessage: document.getElementById('modal-error-message'),
        manualViewReportButton: document.getElementById('manual-view-report-button') // *** 新增 ***
        // ... 其他需要的元素
    };
}


// ==================================
// == Initialization on DOM Ready ==
// ==================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Initializing application...");

    const elements = getUIElements(); // 獲取元素

    // --- DOM Element References ---
    // Store elements in an object for easy access
/*     const elements = {
        notificationBar: document.getElementById('new-report-notification'),
        viewReportButton: document.getElementById('view-report-button'),
        modalOverlay: document.getElementById('report-modal-overlay'),
        modalBody: document.getElementById('report-modal-body'),
        closeModalButton: document.getElementById('close-report-modal'),
        downloadPdfButton: document.getElementById('download-pdf-button'),
        modalErrorMessage: document.getElementById('modal-error-message'),
        retryReportButton: document.getElementById('retry-report-button'),
        googleSigninDiv: document.getElementById('g_id_signin'),
        signoutButton: document.getElementById('signout_button'),
        header: document.querySelector("header") // Fixed: Select header tag directly
    }; */

    // Basic check if essential elements exist
    if (!elements.modalOverlay || !elements.modalBody || !elements.closeModalButton) {
         console.error("Essential modal UI elements are missing! Report functionality may fail.");
    }
    // if (!elements.notificationBar || !elements.viewReportButton) {
    //     console.warn("Notification bar UI elements are missing.");
    // }
     if (!elements.googleSigninDiv || !elements.signoutButton) {
        console.warn("Sign in/out button elements (#g_id_signin or #signout_button) are missing.");
    }


    // --- Event Listener Binding ---
    console.log("Binding event listeners...");

    // Header Scroll Effect
    if (elements.header) {
        window.addEventListener("scroll", () => {
          // Use Tailwind classes directly defined in the config
          if (window.scrollY > 20) {
            elements.header.classList.add("bg-white/70", "backdrop-blur-xs", "shadow-md");
          } else {
            elements.header.classList.remove("bg-white/70", "backdrop-blur-xs", "shadow-md");
          }
        });
        console.log("Header scroll effect listener added.");
    } else { console.warn("Header element not found for scroll effect."); }

    // View Report Button (in notification)
    if (elements.viewReportButton) {
        elements.viewReportButton.addEventListener('click', () => {
            console.log("View Report button clicked.");
            // hideNotification(elements); // Hide notification first
            promptForReportID(elements); // Then prompt for ID
        });
    }

    // *** (可選) 如果添加了重試按鈕，綁定事件 ***
    if (elements.retryReportButton) {
        elements.retryReportButton.addEventListener('click', () => {
            console.log("Retry report button clicked.");
            // 隱藏錯誤訊息和重試按鈕
            if (elements.modalErrorMessage) elements.modalErrorMessage.style.display = 'none';
            if (elements.retryReportButton) elements.retryReportButton.style.display = 'none';
            // 重新提示輸入 ID
            promptForReportID(elements);
        });
    }

    // Close Modal Button
    if (elements.closeModalButton) {
        elements.closeModalButton.addEventListener('click', () => hideModal(elements));
    }

    // Modal Overlay Click (to close modal)
    // if (elements.modalOverlay) {
    //     elements.modalOverlay.addEventListener('click', (event) => {
    //         // Only close if the click is directly on the overlay, not its children
    //         if (event.target === elements.modalOverlay) {
    //             console.log("Modal overlay clicked.");
    //             hideModal(elements);
    //         }
    //     });
    // }

    // Sign Out Button
    if (elements.signoutButton) {
        elements.signoutButton.addEventListener('click', () => handleSignOut(elements));
    }

    // Custom Sign-in Button

    // PDF Download Button (in modal)
    if (elements.downloadPdfButton) {
        elements.downloadPdfButton.addEventListener('click', () => downloadReportAsPDF(elements));
        elements.downloadPdfButton.disabled = true; // Initially disabled
    }

    // *** 新增：為手動查看報告按鈕綁定事件 ***
    if (elements.manualViewReportButton) {
        elements.manualViewReportButton.addEventListener('click', () => {
            console.log("Manual view report button clicked.");
            if (!state.currentUserProfile) {
                 alert("Please log in first to view reports.");
                 return;
            }
            promptForReportID(elements); // 觸發輸入 ID 的流程
        });
    } else {
        console.warn("Manual view report button not found, cannot bind event.");
    }

    // --- Initialization ---
    console.log("Running initial setup...");

    // Set initial UI state for login buttons
    updateLoginUI(false); // Assume not logged in initially

// *** 修改：不在 DOMContentLoaded 時啟動計時器 ***
/*     // Start the periodic check for new reports
    if (CONFIG.gasWebAppUrl && !CONFIG.gasWebAppUrl.includes('YOUR_ACTUAL_GAS_WEB_APP_URL')) {
        // Run the check once immediately on load
        checkAnyNewReportWithStatus(elements);
        // Then start the interval timer
        state.reportCheckIntervalId = setInterval(() => checkAnyNewReportWithStatus(elements), CONFIG.reportCheckIntervalSeconds * 1000);
        console.log(`Started checking for reports every ${CONFIG.reportCheckIntervalSeconds} seconds.`);
    } else {
        console.warn("!!! GAS Web App URL is not configured. Report checking is disabled. Please update CONFIG.gasWebAppUrl in script.js !!!");
        // Optionally display a message to the user on the page itself
        // alert("Application configuration error: Report checking is disabled.");
    } */

    // Add smooth scroll for internal links (if needed, CSS handles basic cases)
    // This is often handled by CSS `scroll-behavior: smooth;` now
    /*
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                targetElement.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
    console.log("Smooth scroll behavior added via JS (if needed).");
    */

    console.log("Initialization complete (Manual Check Mode). Background click to close modal disabled.");

}); // End of DOMContentLoaded

const menuToggle = document.getElementById('menu-toggle');
const navMenu = document.getElementById('nav-menu');
const menuLinks = document.querySelectorAll('.menu-link');

// ✅ 切換菜單開關
menuToggle.addEventListener('click', (e) => {
  e.stopPropagation(); // 防止點擊漢堡按鈕時觸發外部點擊事件
  navMenu.classList.toggle('hidden');
});

// ✅ 點擊任何一個 menu link，收起菜單（手機版）
menuLinks.forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth < 768) {
      navMenu.classList.add('hidden');
    }
  });
});

// ✅ 點擊外部區域自動收起菜單
document.addEventListener('click', (event) => {
  const isClickInsideMenu = navMenu.contains(event.target);
  const isClickToggle = menuToggle.contains(event.target);
  if (!isClickInsideMenu && !isClickToggle) {
    navMenu.classList.add('hidden');
  }
});

// Footer Modal 開啟邏輯
document.querySelectorAll('.footer-link').forEach(link => {
    link.addEventListener('click', function(event) {
      event.preventDefault();
      const targetModalId = this.getAttribute('data-modal');
      openModal(targetModalId);
    });
  });
  
  // 開啟 Modal 函數
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('visible');
      document.body.style.overflow = 'hidden'; // 鎖定滾動
    }
  }
  
  // 關閉 Modal 函數
  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('visible');
      document.body.style.overflow = ''; // 解鎖滾動
    }
  }
  
  // 點擊 Modal 外層也能關閉
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        modal.classList.remove('visible');
        document.body.style.overflow = '';
      }
    });
  });

  // === Hero Section 滾動提示詞效果 ===
  document.addEventListener('DOMContentLoaded', function () {
    const scrollingPrompts = document.querySelector('.scrolling-prompts');
    let position = 0;
    let speed = window.innerWidth < 768 ? 0.4 : 1.0; // 手機慢一點、電腦快一點
  
    function adjustScrollSpeed() {
      speed = window.innerWidth < 768 ? 0.3 : 0.7;
    }
  
    function scroll() {
      position += speed;
      scrollingPrompts.style.transform = `translateY(-${position}px)`;
  
      // 無縫循環效果：捲到一半就重頭來
      if (position >= scrollingPrompts.scrollHeight / 3) {
        position = 0;
      }
  
      requestAnimationFrame(scroll);
    }
  
    // ✅ 初始化一次速度，避免第一次載入需要等 resize
    adjustScrollSpeed();
  
    // ✅ 綁定 resize 和 load 事件
    window.addEventListener('resize', adjustScrollSpeed);
    window.addEventListener('load', adjustScrollSpeed);
  
    // ✅ 加 smooth transition，初始顯示更自然
    scrollingPrompts.style.transition = 'transform 0.2s linear';
  
    // ✅ 頁面載入後 1 秒開始滾動
    setTimeout(() => {
      scroll();
    }, 500);
  });
  
  

// Removed the entire window.onload block as its logic is merged into DOMContentLoaded
// console.log("Script file loaded."); // Log to confirm script file itself is loaded