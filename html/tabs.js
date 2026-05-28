// --- タブ切り替え（デスクトップ: タブバー / モバイル: ハンバーガーメニュー） ---

// デスクトップタブのスタイル定数
const _DESKTOP_BASE     = "tab-btn px-4 py-2 text-sm font-medium rounded-t-lg transition";
const _DESKTOP_ACTIVE    = "bg-slate-800 text-white";
const _DESKTOP_INACTIVE = "text-slate-600 hover:bg-slate-100";
const _DESKTOP_DISABLED = "bg-slate-100 text-slate-400 cursor-not-allowed";

// モバイルドロップダウンのスタイル定数
const _MOBILE_BASE     = "tab-btn w-full text-left px-4 py-2.5 text-sm transition";
const _MOBILE_ACTIVE   = "bg-slate-800 text-white";
const _MOBILE_INACTIVE = "text-slate-600 hover:bg-slate-50";
const _MOBILE_DISABLED = "text-slate-300 cursor-not-allowed pointer-events-none";

// デスクトップタブボタン
const _splitTabButton      = document.querySelector('#desktopTabNav .tab-btn[data-tab="split"]');
const _mergeframeTabButton = document.querySelector('#desktopTabNav .tab-btn[data-tab="mergeframe"]');
const _mosaicTabButton     = document.querySelector('#desktopTabNav .tab-btn[data-tab="mosaic"]');
const _previewTabButton    = document.querySelector('#desktopTabNav .tab-btn[data-tab="preview"]');

const _menuToggle      = document.getElementById("menuToggle");
const _menuDropdown    = document.getElementById("menuDropdown");
const _currentTabLabel = document.getElementById("currentTabLabel");

function setTabsButtonState(hasMovie, hasSplitImages) {
  setElementDisabled(_splitTabButton, !hasMovie);
  setElementDisabled(_mergeframeTabButton, !hasSplitImages);
  setElementDisabled(_mosaicTabButton, !hasSplitImages);
}

function activateTab(name) {
  // disabled チェックはデスクトップボタンを基準にする（外部JSはデスクトップボタンを操作）
  const desktopTarget = document.querySelector(`#desktopTabNav .tab-btn[data-tab="${name}"]`);
  if (desktopTarget?.disabled) return;
  activeTabName = name;

  _menuDropdown.classList.add("hidden");
  _currentTabLabel.textContent = name;

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const isActive = btn.dataset.tab === name;
    // disabled 状態はデスクトップボタンから同期してモバイルにも反映
    const desktopBtn = document.querySelector(`#desktopTabNav .tab-btn[data-tab="${btn.dataset.tab}"]`);
    const isDisabled = desktopBtn?.disabled ?? false;

    if (btn.closest("#desktopTabNav")) {
      // デスクトップタブスタイル
      const state = isDisabled ? _DESKTOP_DISABLED : (isActive ? _DESKTOP_ACTIVE : _DESKTOP_INACTIVE);
      btn.className = `${_DESKTOP_BASE} ${state}`;
    } else {
      // モバイルドロップダウンスタイル
      const state = isDisabled ? _MOBILE_DISABLED : (isActive ? _MOBILE_ACTIVE : _MOBILE_INACTIVE);
      btn.className = `${_MOBILE_BASE} ${state}`;
    }
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `panel-${name}`);
  });
}

function setupTabs() {
  // ドロップダウン開閉
  _menuToggle.addEventListener("click", () => {
    _menuDropdown.classList.toggle("hidden");
  });

  // 外側クリックで閉じる（_menuToggle・_menuDropdown 内のクリックは無視）
  document.addEventListener("click", (e) => {
    if (!_menuToggle.contains(e.target) && !_menuDropdown.contains(e.target)) {
      _menuDropdown.classList.add("hidden");
    }
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      activateTab(btn.dataset.tab);
    });
  });

  activateTab("upload");
}
