import tabs from './common/onetab/tabs'
import storage from './common/onetab/storage'
import options from './common/util/options'
import _ from 'lodash'
import __ from './common/util/i18n'
import browser from 'webextension-polyfill'

/*MV3: autoreload 依赖的 getPackageDirectoryEntry 与 webpack 动态加载(依赖 window/document)
在 service worker 中均不可用, 已移除; 开发时请在 chrome://extensions 手动重新加载*/

// if (PRODUCTION) import(
//   /* webpackChunkName: "tracker", webpackMode: "lazy" */
//   '@/common/util/tracker'
//   ).then(({tracker}) => tracker());

/*service worker 无 window 对象, 用模块级变量保存运行时状态*/
let currentBrowserAction;
let browswerActionClickedHandler;
let contextMenusClickedHandler;
let updateVersion;

if (DEBUG) {
  globalThis.tabs = tabs;
  globalThis.browser = browser
}

/*插件icon鼠标点击后弹出页面,获取页面的操作对应的callback*/
const getBrowserActionHandler = action => {

  if (action === 'menu_show_list') return () => tabs.openTabLists();
  if (action === 'menu_store_left_tabs') return () => tabs.storeLeftTabs();
  if (action === 'menu_store_right_tabs') return () => tabs.storeRightTabs();
  if (action === 'menu_store_selected_tabs') return () => tabs.storeSelectedTabs();
  if (action === 'menu_store_twoside_tabs') return () => tabs.storeTwoSideTabs();
  if (action === 'menu_store_all_tabs') return () => tabs.storeAllTabs();
  if (action === 'menu_store_all_in_all_windows') return () => tabs.storeAllTabInAllWindows();
  if (action === 'menu_show_history_in_this_windows') return () => tabs.historyTabs();
};

/*更新插件icon鼠标点击事件*/
const updateBrowserAction = (action, tmp = false) => {
  if (!tmp) currentBrowserAction = action;
  const items = _.find(options.optionsList, {name: 'browserAction'}).items;
  const label = _.find(items, {value: action}).label;
  browser.action.setTitle({title: label}); 
  if (action === 'menu_show_history_in_this_windows'){ //提前初始化，否则会出现第一次点击无效
    browser.action.setPopup({popup: 'index.html#/history'});
  } else {
    browser.action.setPopup({popup: ''});
  }
  browswerActionClickedHandler = getBrowserActionHandler(action);
};

/*设置右键菜单*/
/*chrome.contextMenus.ACTION_MENU_TOP_LEVEL_LIMIT == 6。只能显示6个，所以出现store_all_in_all_windows没有显示的问题，不是bug。
解决办法，移除左键点击的那个option,比如默认设置"显示列表",那么右键菜单中就不会显示这个选项
todo*/
const setupContextMenus = async () => {
  await browser.contextMenus.removeAll();
  /*MV3: BROWSER_ACTION 上下文改名为 ACTION*/
  const contexts = [browser.contextMenus.ContextType.ACTION];
  contexts.push(browser.contextMenus.ContextType.PAGE);
  const menus = {
    show_list: tabs.openTabLists,
    store_selected_tabs: tabs.storeSelectedTabs,
    store_left_tabs: tabs.storeLeftTabs,
    store_right_tabs: tabs.storeRightTabs,
    store_twoside_tabs: tabs.storeTwoSideTabs,
    store_all_tabs: tabs.storeAllTabs,
    store_all_in_all_windows: tabs.storeAllTabInAllWindows,
  };
  const createMenus = async (obj, parent) => {
    for (const key of Object.keys(obj)) {
      const prop = {
        id: key,
        /* "menu_" + menus.props == i18 msg item。如果不存在会显示错误*/
        title: __('menu_' + key),
        contexts,
      };
      if (parent) {
        prop.id = parent + '.' + key;
        prop.parentId = parent
      }
      await browser.contextMenus.create(prop);
      if (_.isObject(obj[key])) await createMenus(obj[key], key)
    }
  };
  createMenus(menus);
  /*get：根据路径查找元素*/
  /*menuItemId: == id:key*/
  contextMenusClickedHandler = info => _.get(menus, info.menuItemId)()
};

/*动态设置右键菜单,会计算tab的具体数量*/
const dynamicDisableMenu = async () => {
  const groupedTabs = await tabs.groupTabsInCurrentWindow();
  /*update: 需要key == menus.key */
  browser.contextMenus.update('store_left_tabs', {
    enabled: groupedTabs.left.length !== 0,
    title: __('menu_store_left_tabs') + ` (${groupedTabs.left.length})`,
  });
  browser.contextMenus.update('store_right_tabs', {
    enabled: groupedTabs.right.length !== 0,
    title: __('menu_store_right_tabs') + ` (${groupedTabs.right.length})`,
  });
  browser.contextMenus.update('store_twoside_tabs', {
    enabled: groupedTabs.twoSide.length !== 0,
    title: __('menu_store_twoside_tabs') + ` (${groupedTabs.twoSide.length})`,
  })
};

/*设置icon右键菜单
* 设置右键菜单
* 初始化配置 (service worker 每次唤醒都会重新执行, 恢复运行时状态)*/
const init = async () => {
  const opts = await storage.getOptions() || {};
  /*合并obj;同属性取第一个参数的属性值*/
  _.defaults(opts, options.getDefaultOptions());
  await storage.setOptions(opts);
  /*初始化icon右键菜单*/
  updateBrowserAction(opts.browserAction);

  /*初始化右键菜单*/
  await setupContextMenus();
  return opts
};

/*MV3: 监听器必须在首轮同步代码中注册, 否则 service worker 被事件唤醒时会丢事件;
回调内等待 initPromise 保证状态已恢复*/
const initPromise = init();

browser.runtime.onMessage.addListener(async msg => {
  if (msg.optionsChanged) {
    const opts = await initPromise;
    const changes = msg.optionsChanged;
    Object.assign(opts, changes);
    if (changes.browserAction) updateBrowserAction(changes.browserAction);
    await browser.runtime.sendMessage({optionsChangeHandledStatus: 'success'});
  }
});

/*监听更新*/
browser.runtime.onUpdateAvailable.addListener(detail => {
  updateVersion = detail.version
});

/*监听安装*/
browser.runtime.onInstalled.addListener(detail => {
  if (detail.reason === chrome.runtime.OnInstalledReason.UPDATE) {
    tabs.openTheFirstSidePage()
  }
});
/*监听点击icon事件*/
browser.action.onClicked.addListener(async action => {
  await initPromise;
  browswerActionClickedHandler(action)
});

/*监听右键菜单*/
browser.contextMenus.onClicked.addListener(async info => {
  await initPromise;
  contextMenusClickedHandler(info)
});

/*动态更新当前的tab*/
browser.tabs.onCreated.addListener(_.debounce(tab => {
  let activeInfo = {"tabId": tab.id, "windowId": tab.windowId};
  dynamicDisableMenu(activeInfo)
}, 200));
browser.tabs.onActivated.addListener(_.debounce(activeInfo => {
  dynamicDisableMenu(activeInfo)
}, 200));
browser.tabs.onMoved.addListener(_.debounce(activeInfo => {
  dynamicDisableMenu(activeInfo)
}, 200));

/*快捷键监听*/
browser.commands.onCommand.addListener(async command => {
  if (command === 'menu_show_list') tabs.openTabLists();
  else if (command === 'menu_store_left_tabs') tabs.storeLeftTabs();
  else if (command === 'menu_store_right_tabs') tabs.storeRightTabs();
  else if (command === 'menu_store_selected_tabs') tabs.storeSelectedTabs();
  else if (command === 'menu_store_twoside_tabs') tabs.storeTwoSideTabs();
  else if (command === 'menu_store_all_tabs') tabs.storeAllTabs();
  else if (command === 'menu_store_all_in_all_windows') tabs.storeAllTabInAllWindows();
});

browser.omnibox.onInputEntered.addListener(
  function(text) {
    // Encode user input for special characters , / ? : @ & = + $ #
    var newURL = browser.runtime.getURL(`index.html#/view/home?search=${encodeURIComponent(text)}`);
    /*service worker 无 window.open, 改用 tabs.create*/
    browser.tabs.create({ url: newURL });
  });
