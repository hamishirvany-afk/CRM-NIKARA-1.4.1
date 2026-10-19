import fs from 'node:fs';

function assert(condition,message){
  if(!condition){console.error('REMINDER_SYSTEM_CONTRACT_FAIL:',message);process.exit(1)}
}

const app=fs.readFileSync('frontend/app.js','utf8');
const store=fs.readFileSync('frontend/offline-store.js','utf8');
const html=fs.readFileSync('frontend/index.html','utf8');
const css=fs.readFileSync('frontend/style.css','utf8');

assert(store.includes('const DB_VERSION = 11'),'IndexedDB version was not upgraded');
assert(/STORES\s*=\s*\[[^\]]*['"]reminders['"]/.test(store),'general reminders store missing');
assert(store.includes("p === '/api/reminders' && method === 'POST'"),'general reminder create API missing');
assert(store.includes("p === '/api/reminders' && method === 'GET'"),'general reminder list API missing');
assert(store.includes("/^\\/api\\/reminders\\/([^/]+)$/"),'general reminder update/delete API missing');
assert(store.includes('reminders: data.reminders'),'reminders missing from backup export');
assert(store.includes('const reminders = Array.isArray(payload.reminders)'),'reminders missing from backup import');

assert(html.includes('id="reminderList"')&&html.includes('id="taskReminderList"'),'general reminder UI lists missing');
assert(html.includes('onclick="openReminder()"'),'new reminder action missing');
assert(css.includes('.reminder-row')&&css.includes('.calendar-chip.reminder'),'reminder UI styling missing');

const ensureStart=app.indexOf('async function ensureReminderPermission');
const ensureEnd=app.indexOf('async function enableMobileReminders',ensureStart);
const ensureBlock=app.slice(ensureStart,ensureEnd);
const requestIndex=ensureBlock.indexOf('requestPermissions');
const exactIndex=ensureBlock.indexOf('checkExactNotificationSetting');
const channelIndex=ensureBlock.indexOf('createReminderChannel');
assert(ensureStart>=0&&requestIndex>=0&&exactIndex>requestIndex&&channelIndex>exactIndex,'first reminder setup must request permission, check exact alarms, then create the channel');
assert(!ensureBlock.includes('changeExactNotificationSetting();return false'),'exact-alarm settings flow stops before immediate scheduling');
assert(app.includes("id:REMINDER_CHANNEL_ID")&&app.includes("importance:4")&&app.includes("sound:'default'"),'Android reminder channel configuration incomplete');
assert(app.includes('channelId:REMINDER_CHANNEL_ID'),'scheduled notifications do not use the reminder channel');
assert(app.includes("scheduleIndependentReminder(reminder,{firstCreation:!id})"),'independent reminder is not scheduled immediately after save');
assert(app.includes("LN.schedule({notifications:[notification]})"),'single-reminder immediate schedule call missing');
assert(app.includes("api('/api/reminders')")&&app.includes("prepare('reminder'"),'full notification sync omits general reminders');
assert(app.includes("x.kind==='reminder'&&x.reminder_id"),'notification tap does not open the general reminder');
assert(app.includes("setTimeout(()=>syncNativeNotifications().catch(()=>{}),600)"),'cold-start notification recovery missing');
assert(app.includes('allowWhileIdle:true'),'Doze-safe reminder scheduling missing');

console.log('REMINDER_SYSTEM_CONTRACT_PASS');
