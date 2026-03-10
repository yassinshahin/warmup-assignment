const fs = require("fs");
//hellper functions that will be called in other functions or methods 

function timeToSeconds(timeStr) {
    timeStr = timeStr.trim().toLowerCase();
    const parts = timeStr.split(' ');
    const period = parts[1];
    const [h, m, s] = parts[0].split(':').map(Number);
    let hours = h;
    if (period === 'pm' && h !== 12) hours += 12;
    if (period === 'am' && h === 12) hours = 0;
    return hours * 3600 + m * 60 + s;
}

function hmsToSeconds(hmsStr) {
    const [h, m, s] = hmsStr.trim().split(':').map(Number);
    return h * 3600 + m * 60 + s;
}

function secondsToHMS(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseShiftLine(line) {
    const parts = line.split(',');
    return {
        driverID: parts[0].trim(),
        driverName: parts[1].trim(),
        date: parts[2].trim(),
        startTime: parts[3].trim(),
        endTime: parts[4].trim(),
        shiftDuration: parts[5].trim(),
        idleTime: parts[6].trim(),
        activeTime: parts[7].trim(),
        metQuota: parts[8].trim() === 'true',
        hasBonus: parts[9].trim() === 'true'
    };
}

function shiftToLine(obj) {
    return `${obj.driverID},${obj.driverName},${obj.date},${obj.startTime},${obj.endTime},${obj.shiftDuration},${obj.idleTime},${obj.activeTime},${obj.metQuota},${obj.hasBonus}`;
}

function parseRateLine(line) {
    const parts = line.split(',');
    return {
        driverID: parts[0].trim(),
        dayOff: parts[1].trim(),
        basePay: parseInt(parts[2].trim()),
        tier: parseInt(parts[3].trim())
    };
}
function getShiftDuration(startTime, endTime) {
      const startSec = timeToSeconds(startTime);
    const endSec = timeToSeconds(endTime);
    const diff = endSec - startSec;
    return secondsToHMS(diff);
}

function getIdleTime(startTime, endTime) {
    const startSec = timeToSeconds(startTime);
    const endSec = timeToSeconds(endTime);
    const deliveryStart = 8 * 3600;   // 8:00 AM in seconds
    const deliveryEnd = 22 * 3600;    // 10:00 PM in seconds

    let idleTime = 0;

    //  8 AM
    if (startSec < deliveryStart) {
        idleTime += Math.min(deliveryStart, endSec) - startSec;
    }

    //  10 PM
    if (endSec > deliveryEnd) {
        idleTime += endSec - Math.max(deliveryEnd, startSec);
    }

    return secondsToHMS(idleTime);
}


function getActiveTime(shiftDuration, idleTime) {
       const shiftSec = hmsToSeconds(shiftDuration);
    const idleSec = hmsToSeconds(idleTime);
    return secondsToHMS(shiftSec - idleSec);
}

function metQuota(date, activeTime) {
    const dateParts = date.split('-').map(Number);
    const year = dateParts[0];
    const month = dateParts[1];
    const day = dateParts[2];
    const activeSec = hmsToSeconds(activeTime);

    // Eid al-Fitr: April 10–30, 2025 → quota = 6 hours as in stated in warup A.
    const isEid = (year === 2025 && month === 4 && day >= 10 && day <= 30);
    const quotaSec = isEid ? 6 * 3600 : 8 * 3600 + 24 * 60;

    return activeSec >= quotaSec;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
   const content = fs.readFileSync(textFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    //duplicate (same driverID + date)
    for (const line of lines) {
        const record = parseShiftLine(line);
        if (record.driverID === shiftObj.driverID && record.date === shiftObj.date) {
            return {};
        }
    }

    // Calculate derived fields
    const shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    const idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    const activeTime = getActiveTime(shiftDuration, idleTime);
    const quota = metQuota(shiftObj.date, activeTime);

    const newRecord = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration: shiftDuration,
        idleTime: idleTime,
        activeTime: activeTime,
        metQuota: quota,
        hasBonus: false
    };

    const newLine = shiftToLine(newRecord);

    //position to insert: after last record of same driverID
    let lastIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        const record = parseShiftLine(lines[i]);
        if (record.driverID === shiftObj.driverID) {
            lastIndex = i;
        }
    }

    if (lastIndex === -1) {
        // if driverID not found append at end
        lines.push(newLine);
    } else {
        // Insert after last record of this driverID
        lines.splice(lastIndex + 1, 0, newLine);
    }

    fs.writeFileSync(textFile, lines.join('\n') + '\n', 'utf8');

    return newRecord;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
       const content = fs.readFileSync(textFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    const updatedLines = lines.map(line => {
        const record = parseShiftLine(line);
        if (record.driverID === driverID && record.date === date) {
            record.hasBonus = newValue;
            return shiftToLine(record);
        }
        return line;
    });

    fs.writeFileSync(textFile, updatedLines.join('\n') + '\n', 'utf8');
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
       const content = fs.readFileSync(textFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    const targetMonth = parseInt(month); // handles "04" and "4" both

    let driverExists = false;
    let bonusCount = 0;

    for (const line of lines) {
        const record = parseShiftLine(line);
        if (record.driverID === driverID) {
            driverExists = true;
            const recordMonth = parseInt(record.date.split('-')[1]);
            if (recordMonth === targetMonth && record.hasBonus === true) {
                bonusCount++;
            }
        }
    }

    return driverExists ? bonusCount : -1;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
       const content = fs.readFileSync(textFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    let totalSeconds = 0;

    for (const line of lines) {
        const record = parseShiftLine(line);
        const recordMonth = parseInt(record.date.split('-')[1]);
        if (record.driverID === driverID && recordMonth === month) {
            totalSeconds += hmsToSeconds(record.activeTime);
        }
    }

    return secondsToHMS(totalSeconds);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
        const shiftContent = fs.readFileSync(textFile, 'utf8');
    const shiftLines = shiftContent.split('\n').filter(line => line.trim() !== '');

    const rateContent = fs.readFileSync(rateFile, 'utf8');
    const rateLines = rateContent.split('\n').filter(line => line.trim() !== '');

    // Get driver's day off
    let dayOff = null;
    for (const line of rateLines) {
        const rate = parseRateLine(line);
        if (rate.driverID === driverID) {
            dayOff = rate.dayOff.toLowerCase();
            break;
        }
    }

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    let totalSeconds = 0;

    for (const line of shiftLines) {
        const record = parseShiftLine(line);
        const recordMonth = parseInt(record.date.split('-')[1]);

        if (record.driverID === driverID && recordMonth === month) {
            // Check if this date is the driver's day off
            const dateObj = new Date(record.date);
            const dayName = dayNames[dateObj.getDay()];

            if (dayName === dayOff) continue; // skip day off

            // Check if date falls in Eid period
            const [year, mon, day] = record.date.split('-').map(Number);
            const isEid = (year === 2025 && mon === 4 && day >= 10 && day <= 30);

            const dailyQuota = isEid ? 6 * 3600 : 8 * 3600 + 24 * 60;
            totalSeconds += dailyQuota;
        }
    }

    // Subtract 2 hours per bonus
    totalSeconds -= bonusCount * 2 * 3600;
    if (totalSeconds < 0) totalSeconds = 0;

    return secondsToHMS(totalSeconds);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
      const rateContent = fs.readFileSync(rateFile, 'utf8');
    const rateLines = rateContent.split('\n').filter(line => line.trim() !== '');

    let basePay = 0;
    let tier = 0;

    for (const line of rateLines) {
        const rate = parseRateLine(line);
        if (rate.driverID === driverID) {
            basePay = rate.basePay;
            tier = rate.tier;
            break;
        }
    }

    const actualSec = hmsToSeconds(actualHours);
    const requiredSec = hmsToSeconds(requiredHours);

    // No deduction if actual >= required
    if (actualSec >= requiredSec) return basePay;

    const missingSec = requiredSec - actualSec;
    const missingHours = Math.floor(missingSec / 3600); // full hours only

    // Tier allowances
    const allowance = { 1: 50, 2: 20, 3: 10, 4: 3 };
    const allowed = allowance[tier];

    const billableHours = Math.max(0, missingHours - allowed);

    const deductionRatePerHour = Math.floor(basePay / 185);
    const salaryDeduction = billableHours * deductionRatePerHour;

    return basePay - salaryDeduction;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
