import moment from 'moment'
import __ from './i18n'
import {getBrowserType} from './browserType'

moment.locale(__('@@ui_locale'));

const formatTime = time => {
  if (Date.now() - time < 3600E3) return moment(time).fromNow();
  formatTimeForTitle(time)
};

const formatTimeForTitle = time => {
  const withYear = !moment(time).isSame(new Date(), 'year');
  return withYear
    ? moment(time).format('MMMM Do YYYY, h:mm:ss a')
    : moment(time).format('MMMM Do, h:mm:ss a')
};

const asyncWorker = promise => {
  return promise.then(res => [null, res]).catch(err => [err])
}

const isChromeUrl = url => {
  return /^chrome/.test(url);
}

const getUrlDomain = url => {
  try {
    return new URL(url).hostname;
  } catch(err) {
    return '';
  }
}

const getDomain = url => {
  return isChromeUrl(url) ? '' : getUrlDomain(url);
}

/*MV3: chrome://favicon 已移除, 改用 _favicon API (需 manifest "favicon" 权限); size 为像素宽度*/
const getFaviconUrl = (url, size = 32) => {
  return chrome.runtime.getURL('/_favicon/') + `?pageUrl=${encodeURIComponent(url)}&size=${size}`;
}

let fDomain = ["com","net","gov","org","ac","edu","co","biz","info"]
const getMainDomain = domain => {
  let isSubDomain = fDomain.filter((demo)=>{
    return domain.split('.').slice(-2)[0] === demo;
  })
  console.log(isSubDomain);
  if(isSubDomain.length > 0){
    return domain.split('.').slice(-3).join('.');
  }
  return domain.split('.').slice(-2).join('.');
}

const isFF = () => {
  return getBrowserType === 'FF'
}




export default {
  formatTime,
  formatTimeForTitle,
  asyncWorker,
  getDomain,
  getMainDomain,
  getUrlDomain,
  getFaviconUrl,
  isFF
}
