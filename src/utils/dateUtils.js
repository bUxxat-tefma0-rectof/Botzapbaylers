function addMinutes(minutes) {
    const date = new Date();
    date.setMinutes(date.getMinutes() + parseInt(minutes));
    return date;
}

function formatDateTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

function formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function diffInMinutes(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diff = Math.abs(d1 - d2);
    return Math.floor(diff / (1000 * 60));
}

function isExpired(date) {
    if (!date) return false;
    const now = new Date();
    const target = new Date(date);
    return now > target;
}

function getCurrentDateTime() {
    return formatDateTime(new Date());
}

module.exports = {
    addMinutes,
    formatDateTime,
    formatDate,
    formatTime,
    diffInMinutes,
    isExpired,
    getCurrentDateTime
};
