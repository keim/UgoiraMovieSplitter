// --- タブ切り替え（デスクトップ: タブバー / モバイル: ハンバーガーメニュー） ---

// デスクトップタブのスタイル定数
const DESKTOP_BASE     = "tab-btn px-4 py-2 text-sm font-medium rounded-t-lg transition";
const DESKTOP_ACTIVE   = "bg-slate-800 text-white";
const DESKTOP_INACTIVE = "text-slate-600 hover:bg-slate-100";
const DESKTOP_DISABLED = "bg-slate-100 text-slate-400 cursor-not-allowed";

// モバイルドロップダウンのスタイル定数
const MOBILE_BASE     = "tab-btn w-full text-left px-4 py-2.5 text-sm transition";
const MOBILE_ACTIVE   = "bg-slate-800 text-white";
const MOBILE_INACTIVE = "text-slate-600 hover:bg-slate-50";
const MOBILE_DISABLED = "text-slate-300 cursor-not-allowed pointer-events-none";

// デスクトップタブボタン（外部JSが .disabled を設定するために参照）
const splitTabButton      = document.querySelector('#desktopTabNav .tab-btn[data-tab="split"]');
const mergeframeTabButton = document.querySelector('#desktopTabNav .tab-btn[data-tab="mergeframe"]');
const mosaicTabButton     = document.querySelector('#desktopTabNav .tab-btn[data-tab="mosaic"]');
const previewTabButton    = document.querySelector('#desktopTabNav .tab-btn[data-tab="preview"]');

const menuToggle      = document.getElementById("menuToggle");
const menuDropdown    = document.getElementById("menuDropdown");
const currentTabLabel = document.getElementById("currentTabLabel");

// ドロップダウン開閉
menuToggle.addEventListener("click", () => {
  menuDropdown.classList.toggle("hidden");
});

// 外側クリックで閉じる（menuToggle・menuDropdown 内のクリックは無視）
document.addEventListener("click", (e) => {
  if (!menuToggle.contains(e.target) && !menuDropdown.contains(e.target)) {
    menuDropdown.classList.add("hidden");
  }
});

function activateTab(name) {
  // disabled チェックはデスクトップボタンを基準にする（外部JSはデスクトップボタンを操作）
  const desktopTarget = document.querySelector(`#desktopTabNav .tab-btn[data-tab="${name}"]`);
  if (desktopTarget?.disabled) return;

  menuDropdown.classList.add("hidden");
  currentTabLabel.textContent = name;

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const isActive = btn.dataset.tab === name;
    // disabled 状態はデスクトップボタンから同期してモバイルにも反映
    const desktopBtn = document.querySelector(`#desktopTabNav .tab-btn[data-tab="${btn.dataset.tab}"]`);
    const isDisabled = desktopBtn?.disabled ?? false;

    if (btn.closest("#desktopTabNav")) {
      // デスクトップタブスタイル
      const state = isDisabled ? DESKTOP_DISABLED : (isActive ? DESKTOP_ACTIVE : DESKTOP_INACTIVE);
      btn.className = `${DESKTOP_BASE} ${state}`;
    } else {
      // モバイルドロップダウンスタイル
      const state = isDisabled ? MOBILE_DISABLED : (isActive ? MOBILE_ACTIVE : MOBILE_INACTIVE);
      btn.className = `${MOBILE_BASE} ${state}`;
    }
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `panel-${name}`);
  });
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    activateTab(btn.dataset.tab);
  });
});

activateTab("upload");
