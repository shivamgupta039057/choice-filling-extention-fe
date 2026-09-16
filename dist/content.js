(() => {
if (window.__choiceFillingHelperListener) {
  chrome.runtime.onMessage.removeListener(window.__choiceFillingHelperListener);
}
const BUTTON_TEXT = /^add$/i;
const MCC_HOST = "mcc.admissions.nic.in";
const ADD_DELAY_MS = 3000;
let fillJob = null;

window.__choiceFillingHelperListener = (message, sender, sendResponse) => {
  if (message.type === "MCC_PREVIEW_CHOICES") {
    sendResponse(previewChoices(message.priorityItems || [], message.skippedRanks || []));
    return true;
  }
  if (message.type === "MCC_START_FILLING") {
    sendResponse(startFillJob(message.priorityItems || [], message.skippedRanks || []));
    return true;
  }
  if (message.type === "MCC_SKIP_BLOCKER") {
    sendResponse(skipBlockedChoice(message.priorityItems || [], message.skippedRanks || []));
    return true;
  }
  if (message.type === "MCC_PAUSE_FILLING") {
    sendResponse(pauseFillJob());
    return true;
  }
  if (message.type === "MCC_RESUME_FILLING") {
    sendResponse(resumeFillJob());
    return true;
  }
  if (message.type === "MCC_STOP_FILLING") {
    sendResponse(stopFillJob());
    return true;
  }
  if (message.type === "MCC_FILL_STATUS") {
    sendResponse(fillJobStatus());
    return true;
  }
  return false;
};
chrome.runtime.onMessage.addListener(window.__choiceFillingHelperListener);

function previewChoices(priorityItems, skippedRanks = []) {
  const rows = getChoiceRows();
  const matches = matchAllChoices(priorityItems, rows);
  const foundCount = matches.filter((item) => item.found).length;
  const skippedSet = rankSet(skippedRanks);
  const leadingMatches = leadingFillableMatches(matches, skippedSet);
  const blocker = firstBlockingMatch(matches, skippedSet);
  const duplicateCount = matches.filter((item) => item.duplicate).length;
  const alreadyFilledCount = matches.filter((item) => item.alreadyFilled).length;
  const existingCount = getExistingChoiceCount();
  const missingProgramCount = matches.filter((item) => item.reason === "Program missing in sheet").length;
  let message = `${foundCount} of ${matches.length} choices matched.`;
  if (alreadyFilledCount) {
    message += ` ${alreadyFilledCount} are already in Filled Choice(s).`;
  }
  message += ` Next ${leadingMatches.length} can be filled safely in order.`;
  if (blocker) {
    message += ` Filling will stop at rank ${blocker.rank}: ${blocker.reason || "Not found"}.`;
  }
  if (duplicateCount) {
    message += ` ${duplicateCount} duplicate Excel rows skipped because the first copy is already matched.`;
  }
  if (skippedSet.size) {
    message += ` Skipped ranks: ${[...skippedSet].join(", ")}.`;
  }
  if (isMcc() && missingProgramCount) {
    message += ` ${missingProgramCount} rows need a Program value.`;
  }
  if (existingCount) {
    message += ` Total filled choices currently on page: ${existingCount}.`;
  }
  return {
    matches: stripInternalFields(matches),
    fillableBeforeBlock: leadingMatches.length,
    firstBlockingMatch: blocker ? stripInternalFields([blocker])[0] : null,
    skippedRanks: [...skippedSet],
    message
  };
}

function startFillJob(priorityItems, skippedRanks = []) {
  if (fillJob?.running) return fillJobStatus("Filling is already running.");
  const matches = matchAllChoices(priorityItems, getChoiceRows());
  const skippedSet = rankSet(skippedRanks);
  const safeMatches = leadingFillableMatches(matches, skippedSet);
  const blocker = firstBlockingMatch(matches, skippedSet);
  if (!safeMatches.length) {
    return {
      matches: stripInternalFields(matches),
      added: 0,
      total: 0,
      running: false,
      paused: false,
      stopped: false,
      fillableBeforeBlock: 0,
      firstBlockingMatch: blocker ? stripInternalFields([blocker])[0] : null,
      skippedRanks: [...skippedSet],
      message: blocker
        ? `Cannot start. Rank ${blocker.rank} is not fillable: ${blocker.reason || "Not found"}.`
        : "No matched choices are available to fill."
    };
  }
  const existingCount = getExistingChoiceCount();
  fillJob = {
    running: true, paused: false, stopped: false,
    index: 0, added: 0, total: safeMatches.length,
    matches, safeMatches, firstBlockingMatch: blocker || null, skippedRanks: [...skippedSet],
    lastMessage: existingCount
      ? `Started filling first ${safeMatches.length} choices after existing ${existingCount} filled choices.`
      : `Started filling first ${safeMatches.length} choices with 3 second delay.`
  };
  if (blocker) {
    fillJob.lastMessage += ` It will stop before rank ${blocker.rank}: ${blocker.reason || "Not found"}.`;
  }
  runFillJob();
  return fillJobStatus(fillJob.lastMessage);
}

function skipBlockedChoice(priorityItems, skippedRanks = []) {
  const matches = matchAllChoices(priorityItems, getChoiceRows());
  const skippedSet = rankSet(skippedRanks);
  const blocker = firstBlockingMatch(matches, skippedSet);
  if (!blocker) {
    return {
      matches: stripInternalFields(matches),
      added: 0,
      total: 0,
      running: false,
      paused: false,
      stopped: false,
      fillableBeforeBlock: 0,
      firstBlockingMatch: null,
      skippedRanks: [...skippedSet],
      message: "No blocked choice to skip."
    };
  }
  skippedSet.add(Number(blocker.rank));
  return startFillJob(priorityItems, [...skippedSet]);
}

async function runFillJob() {
  if (!fillJob) return;
  while (fillJob.index < fillJob.safeMatches.length && !fillJob.stopped) {
    while (fillJob.paused && !fillJob.stopped) {
      fillJob.lastMessage = `Paused at ${fillJob.added}/${fillJob.total}.`;
      await wait(300);
    }
    if (fillJob.stopped) break;
    const match = fillJob.safeMatches[fillJob.index];
    fillJob.lastMessage = `Adding ${fillJob.index + 1}/${fillJob.total}: ${match.choiceName} | ${match.program}`;
    if (match.rajasthan) {
      const added = await addRajasthanChoice(match);
      if (!added) {
        fillJob.stopped = true;
        fillJob.firstBlockingMatch = { ...match, found: false, reason: "Could not click Rajasthan Add button after filtering" };
        break;
      }
    } else {
      if (!document.contains(match.button) || !BUTTON_TEXT.test(clean(match.button.value || match.button.textContent))) {
        fillJob.stopped = true;
        fillJob.firstBlockingMatch = { ...match, found: false, reason: "Add button was no longer available" };
        break;
      }
      markRow(match.row);
      match.button.click();
    }
    fillJob.added += 1;
    fillJob.index += 1;
    fillJob.lastMessage = `Added ${fillJob.added}/${fillJob.total}. Waiting 3 seconds...`;
    await wait(ADD_DELAY_MS);
  }
  if (!fillJob) return;
  fillJob.running = false;
  fillJob.paused = false;
  if (fillJob.stopped && fillJob.firstBlockingMatch) {
    fillJob.lastMessage = `Stopped at rank ${fillJob.firstBlockingMatch.rank}. Added ${fillJob.added}/${fillJob.total}; next choice is not fillable: ${fillJob.firstBlockingMatch.reason || "Not found"}. Review, then save manually.`;
  } else if (fillJob.stopped) {
    fillJob.lastMessage = `Stopped after adding ${fillJob.added}/${fillJob.total}.`;
  } else if (fillJob.firstBlockingMatch) {
    fillJob.lastMessage = `Stopped at rank ${fillJob.firstBlockingMatch.rank}. Added ${fillJob.added}/${fillJob.total}; next choice is not fillable: ${fillJob.firstBlockingMatch.reason || "Not found"}. Review, then save manually.`;
  } else {
    fillJob.lastMessage = `Done. Added ${fillJob.added}/${fillJob.total}. Review the Filled Choice(s) table, then save manually.`;
  }
}

function pauseFillJob() {
  if (!fillJob?.running) return fillJobStatus("No active filling job.");
  fillJob.paused = true;
  fillJob.lastMessage = `Pause requested. It will pause after the current Add finishes.`;
  return fillJobStatus(fillJob.lastMessage);
}

function resumeFillJob() {
  if (!fillJob) return fillJobStatus("No paused filling job.");
  if (!fillJob.running && fillJob.index >= fillJob.total) return fillJobStatus(fillJob.lastMessage);
  const shouldRestartLoop = !fillJob.running;
  fillJob.paused = false;
  fillJob.running = true;
  fillJob.lastMessage = `Resumed at ${fillJob.added}/${fillJob.total}.`;
  if (shouldRestartLoop) runFillJob();
  return fillJobStatus(fillJob.lastMessage);
}

function stopFillJob() {
  if (!fillJob) return fillJobStatus("No active filling job.");
  fillJob.stopped = true;
  fillJob.paused = false;
  fillJob.lastMessage = `Stop requested after ${fillJob.added}/${fillJob.total}.`;
  return fillJobStatus(fillJob.lastMessage);
}

function fillJobStatus(message) {
  return {
    matches: stripInternalFields(fillJob?.matches || []),
    added: fillJob?.added || 0,
    total: fillJob?.total || 0,
    running: Boolean(fillJob?.running),
    paused: Boolean(fillJob?.paused),
    stopped: Boolean(fillJob?.stopped),
    firstBlockingMatch: fillJob?.firstBlockingMatch ? stripInternalFields([fillJob.firstBlockingMatch])[0] : null,
    skippedRanks: Array.isArray(fillJob?.skippedRanks) ? fillJob.skippedRanks : [],
    message: message || fillJob?.lastMessage || "No active filling job."
  };
}

function isFillableMatch(item) {
  return Boolean(item?.found && !item.alreadyFilled && (
    (item.button && !item.button.disabled) ||
    (item.rajasthan && item.rajasthanSeatValue && (item.rajasthanInstituteValue || item.rajasthanSearchText))
  ));
}

function isSatisfiedMatch(item) {
  return Boolean(item?.found && (item.alreadyFilled || isFillableMatch(item)));
}

function leadingFillableMatches(matches, skippedSet = new Set()) {
  const fillable = [];
  for (const match of matches) {
    if (skippedSet.has(Number(match.rank))) continue;
    if (!isSatisfiedMatch(match)) break;
    if (isFillableMatch(match)) fillable.push(match);
  }
  return fillable;
}

function firstBlockingMatch(matches, skippedSet = new Set()) {
  return matches.find((match) => !skippedSet.has(Number(match.rank)) && !isSatisfiedMatch(match)) || null;
}

function rankSet(values) {
  return new Set((Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0));
}

function getChoiceRows() {
  if (isRajasthan()) return getRajasthanChoiceRows();

  const structuredRows = [
    ...structuredChoiceRows("#avlChoiceContainer", false),
    ...structuredChoiceRows("#filledChoiceContainer", true)
  ];
  if (structuredRows.length) return structuredRows;
  return [...document.querySelectorAll("tr")]
    .map((row) => {
      const button = findAddButton(row);
      const cells = [...row.querySelectorAll("td")].map((cell) => clean(cell.innerText));
      const text = clean(row.innerText);
      return { row, button, cells, text, name: inferInstituteName(cells, text), program: inferProgramName(cells) };
    })
    .filter((item) => item.button && item.name);
}

function structuredChoiceRows(selector, alreadyFilled) {
  return [...document.querySelectorAll(`${selector} tr`)]
    .map((row) => {
      const button = alreadyFilled ? null : row.querySelector("input.aChoice");
      const name = stripActionText(row.querySelector(".instnm"));
      const program = clean(row.querySelector(".brnm")?.textContent);
      const instituteId = clean(row.querySelector(".instcd")?.textContent);
      const programId = clean(row.querySelector(".brcd")?.textContent);
      const quotaId = clean(row.querySelector(".quotaid")?.textContent);
      const quota = clean(row.querySelector(".quota")?.textContent);
      const choiceNo = parseChoiceNo(row);
      return { row, button, name, program, instituteId, programId, quotaId, quota, choiceNo, alreadyFilled };
    })
    .filter((item) => item.name && item.program && (alreadyFilled || item.button));
}

function getRajasthanChoiceRows() {
  return [
    ...getRajasthanAvailableRows(),
    ...getRajasthanFilledRows()
  ];
}

function getRajasthanAvailableRows() {
  return [...document.querySelectorAll(".choice-filling-cover .available-choice table tbody tr")]
    .map((row) => {
      const cells = [...row.querySelectorAll("td")].map((cell) => stripActionText(cell));
      const button = row.querySelector(".add-btn");
      return {
        row,
        button,
        name: cells[0] || "",
        program: cells[1] || "",
        quota: normalizeRajasthanSeatLabel(cells[2] || ""),
        alreadyFilled: false
      };
    })
    .filter((item) => item.name && item.program && item.button);
}

function getRajasthanFilledRows() {
  return [...document.querySelectorAll(".choice-filling-cover .filled-choice table tbody tr")]
    .map((row) => {
      const cells = [...row.querySelectorAll("td")].map((cell) => stripActionText(cell));
      return {
        row,
        button: null,
        choiceNo: Number(cells[0]) || "",
        name: cells[1] || "",
        program: cells[2] || "",
        quota: normalizeRajasthanSeatLabel(cells[3] || ""),
        alreadyFilled: true
      };
    })
    .filter((item) => item.name && item.program);
}

function matchAllChoices(priorityItems, rows) {
  const usedRows = new Set();
  return priorityItems.map((choice) => {
    const match = matchChoice(choice, rows, usedRows);
    if (match.found && match.row) usedRows.add(match.row);
    return match;
  });
}

function matchChoice(choice, rows, usedRows) {
  if (isMcc() && !clean(choice.program) && !clean(choice.programId)) {
    return resultFor(choice, null, 0, "Program missing in sheet");
  }

  const available = rows.filter(r => !usedRows.has(r.row));

  if (choice.instituteId && choice.programId) {
    const allIdHits = rows.filter(
      r => r.instituteId === choice.instituteId && r.programId === choice.programId
    );
    const hit = allIdHits.find(r => !usedRows.has(r.row));
    if (hit) return resultFor(choice, hit, 1, "");
    if (allIdHits.length) return duplicateResult(choice);
  }

  if (isMcc() && choice.program) {
    return matchMccChoice(choice, rows, usedRows);
  }

  if (isRajasthan()) {
    return matchRajasthanChoice(choice, rows, usedRows);
  }

  const scored = available
    .map(r => ({ rowItem: r, ...scoreChoice(choice, r) }))
    .sort((a, b) => b.score - a.score);

  const best   = scored[0];
  const second = scored[1];
  if (!best) return resultFor(choice, null, 0, "Not found");

  const gap = second ? best.score - second.score : 1;
  const found = best.score >= 0.65 && gap >= 0.02;
  return resultFor(choice, found ? best.rowItem : null, found ? best.score : 0,
    found ? "" : "Not found");
}

function matchMccChoice(choice, rows, usedRows) {
  const cn = normalizeMedical(choice.choiceName);
  const pn = normalizeMedicalProgram(choice.program);
  const qn = normalizeQuota(choice.quota);
  if (isGenericPlaceName(choice.choiceName)) {
    return resultFor(choice, null, 0, "Institute name looks like state/city; check institute column");
  }
  const filledAtRank = rows.find(r =>
    r.alreadyFilled &&
    Number(r.choiceNo) === Number(choice.rank) &&
    namesMatchStrict(choice.choiceName, r.name) &&
    normalizeMedicalProgram(r.program) === pn &&
    (!qn || normalizeQuota(r.quota) === qn || normalizeQuota(r.quotaId) === qn) &&
    !usedRows.has(r.row)
  );
  if (filledAtRank) return resultFor(choice, filledAtRank, 0.99, "");

  const exactPairHits = rows.filter(r =>
    normalizeMedical(r.name) === cn &&
    normalizeMedicalProgram(r.program) === pn
  );
  const quotaFilteredHits = qn
    ? exactPairHits.filter(r => normalizeQuota(r.quota) === qn || normalizeQuota(r.quotaId) === qn)
    : exactPairHits;
  const unusedHits = quotaFilteredHits.filter(r => !usedRows.has(r.row));

  if (unusedHits.length === 1) return resultFor(choice, unusedHits[0], 1, "");
  if (unusedHits.length > 1 && !qn) return resultFor(choice, null, 0, "Multiple quotas found; add Quota column in Excel");
  if (quotaFilteredHits.length) return duplicateResult(choice);

  const collegeOnPage = rows.some(r => normalizeMedical(r.name) === cn);
  if (collegeOnPage) {
    const programOnCollege = rows.some(r =>
      normalizeMedical(r.name) === cn &&
      normalizeMedicalProgram(r.program) === pn
    );
    return resultFor(choice, null, 0, programOnCollege ? "Quota not available for this institute/program" : "Program not available for this institute");
  }

  const sameProgramRows = rows.filter(r => normalizeMedicalProgram(r.program) === pn && !usedRows.has(r.row));
  const scored = sameProgramRows
    .map(r => ({ rowItem: r, score: textSimilarityMedical(choice.choiceName, r.name) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  const gap = second ? best.score - second.score : 1;
  if (best && best.score >= 0.92 && gap >= 0.08) {
    return resultFor(choice, best.rowItem, best.score, "");
  }
  return resultFor(choice, null, 0, "Not found");
}

function matchRajasthanChoice(choice, rows, usedRows) {
  const controls = getRajasthanControls();
  if (!controls.instituteSelect || !controls.seatSelect) {
    return resultFor(choice, null, 0, "Rajasthan filters not found");
  }

  const pn = normalizeMedicalProgram(choice.program || "MBBS");
  const desiredSeat = desiredRajasthanSeat(choice.quota);
  const cn = normalizeMedical(choice.choiceName);
  if (isGenericPlaceName(choice.choiceName)) {
    return resultFor(choice, null, 0, "Institute name looks like state/city; check institute column");
  }
  const filledAtRank = rows.find(r =>
    r.alreadyFilled &&
    Number(r.choiceNo) === Number(choice.rank) &&
    namesMatchStrict(choice.choiceName, r.name) &&
    normalizeMedicalProgram(r.program) === pn &&
    r.quota === desiredSeat &&
    !usedRows.has(r.row)
  );
  if (filledAtRank) return resultFor(choice, filledAtRank, 0.99, "");

  const exactFilled = rows.find(r =>
    r.alreadyFilled &&
    normalizeMedical(r.name) === cn &&
    normalizeMedicalProgram(r.program) === pn &&
    r.quota === desiredSeat &&
    !usedRows.has(r.row)
  );
  if (exactFilled) return resultFor(choice, exactFilled, 0.99, "");

  const directAvailable = rows.find(r =>
    !r.alreadyFilled &&
    normalizeMedical(r.name) === cn &&
    normalizeMedicalProgram(r.program) === pn &&
    r.quota === desiredSeat &&
    !usedRows.has(r.row)
  );
  if (directAvailable) return resultFor(choice, directAvailable, 1, "");

  const instituteOptions = selectableOptions(controls.instituteSelect).filter((option) => !usedRows.has(option));
  const scored = instituteOptions
    .map((option) => ({ option, score: textSimilarityMedical(choice.choiceName, option.textContent) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  const courseOption = findOptionByText(controls.courseSelect, choice.program || "MBBS") ||
    selectableOptions(controls.courseSelect)[0];
  const seatOption = findRajasthanSeatOption(controls.seatSelect, desiredSeat);
  if (!courseOption) return resultFor(choice, null, 0, "Course option not found");
  if (!seatOption) return resultFor(choice, null, 0, `${desiredSeat} seat option not found`);
  if (!best && hasRajasthanDynamicSearchInput()) {
    return resultFor(choice, {
      row: null,
      button: null,
      name: choice.choiceName,
      program: clean(courseOption.textContent),
      quota: desiredSeat,
      alreadyFilled: false,
      rajasthan: true,
      rajasthanInstituteValue: "",
      rajasthanCourseValue: courseOption.value,
      rajasthanSeatValue: seatOption.value,
      rajasthanSeatLabel: desiredSeat,
      rajasthanSearchText: choice.choiceName
    }, 0.75, "");
  }
  if (!best) return resultFor(choice, null, 0, "Not found");

  const gap = second ? best.score - second.score : 1;
  if (best.score < 0.90 || gap < 0.06) {
    return resultFor(choice, null, best.score, gap < 0.06 ? "Ambiguous institute match" : "Not found");
  }

  const rowItem = {
    row: best.option,
    button: null,
    name: clean(best.option.textContent),
    program: clean(courseOption.textContent),
    quota: desiredSeat,
    alreadyFilled: false,
    rajasthan: true,
    rajasthanInstituteValue: best.option.value,
    rajasthanCourseValue: courseOption.value,
    rajasthanSeatValue: seatOption.value,
    rajasthanSeatLabel: desiredSeat,
    rajasthanSearchText: choice.choiceName
  };
  return resultFor(choice, rowItem, best.score, "");
}

async function addRajasthanChoice(match) {
  const controls = getRajasthanControls();
  if (!controls.instituteSelect || !controls.courseSelect || !controls.seatSelect) return false;

  if (match.rajasthanInstituteValue) {
    setSelectValue(controls.instituteSelect, match.rajasthanInstituteValue);
  } else {
    const selected = await searchAndSelectRajasthanInstitute(match.rajasthanSearchText || match.choiceName);
    if (!selected) return false;
  }
  await wait(700);
  setSelectValue(controls.courseSelect, match.rajasthanCourseValue);
  await wait(350);
  setSelectValue(controls.seatSelect, match.rajasthanSeatValue);
  await wait(1200);

  const desiredName = match.pageName || match.choiceName;
  const desiredProgram = normalizeMedicalProgram(match.pageProgram || match.program || "MBBS");
  const desiredSeat = normalizeRajasthanSeatLabel(match.rajasthanSeatLabel || match.pageQuota || match.quota);
  const rowItem = getRajasthanAvailableRows().find((row) =>
    namesMatchStrict(row.name, desiredName) &&
    normalizeMedicalProgram(row.program) === desiredProgram &&
    row.quota === desiredSeat
  );
  if (!rowItem?.button || rowItem.button.disabled) return false;

  markRow(rowItem.row);
  rowItem.button.click();
  await wait(600);
  return true;
}

function scoreChoice(choice, rowItem) {
  if (choice.instituteId && choice.programId &&
      choice.instituteId === rowItem.instituteId &&
      choice.programId === rowItem.programId) {
    return { score: 1, instituteScore: 1, programScore: 1 };
  }
  const instituteScore = textSimilarity(choice.choiceName, rowItem.name);
  const programScore   = choice.program ? textSimilarity(choice.program, rowItem.program) : 0;
  const score = choice.program ? (instituteScore * 0.7) + (programScore * 0.3) : instituteScore;
  return { score, instituteScore, programScore };
}

function resultFor(choice, rowItem, score, reason) {
  return {
    rank: choice.rank,
    excelRow: choice.excelRow || "",
    choiceName: choice.choiceName,
    program: choice.program || "",
    quota: choice.quota || "",
    pageName: rowItem?.name || "",
    pageProgram: rowItem?.program || "",
    pageQuota: rowItem?.quota || "",
    pageChoiceNo: rowItem?.choiceNo || "",
    score: score ? Number(score.toFixed(2)) : 0,
    found: Boolean(rowItem),
    alreadyFilled: Boolean(rowItem?.alreadyFilled),
    reason,
    duplicate: false,
    button: rowItem?.button || null,
    row: rowItem?.row || null,
    rajasthan: Boolean(rowItem?.rajasthan),
    rajasthanInstituteValue: rowItem?.rajasthanInstituteValue || "",
    rajasthanCourseValue: rowItem?.rajasthanCourseValue || "",
    rajasthanSeatValue: rowItem?.rajasthanSeatValue || "",
    rajasthanSeatLabel: rowItem?.rajasthanSeatLabel || "",
    rajasthanSearchText: rowItem?.rajasthanSearchText || ""
  };
}

function duplicateResult(choice) {
  return {
    ...resultFor(choice, null, 0, "Duplicate in Excel; first copy is already matched"),
    duplicate: true
  };
}

function stripInternalFields(matches) {
  return matches.map(({ button, row, ...rest }) => rest);
}

function getExistingChoiceCount() {
  if (isRajasthan()) return getRajasthanFilledRows().length;
  return document.querySelectorAll("#filledChoiceContainer tr .fChoice").length;
}

function findAddButton(scope) {
  return [...scope.querySelectorAll("button, input[type='button'], input[type='submit'], a")]
    .find((button) => button.matches?.(".add-btn") || BUTTON_TEXT.test(clean(button.innerText || button.value || button.textContent)));
}

function parseChoiceNo(row) {
  const classValue = clean(row.querySelector(".chno")?.textContent);
  const classNumber = Number(classValue);
  if (Number.isFinite(classNumber) && classNumber > 0) return classNumber;

  const cells = [...row.querySelectorAll("td")].map((cell) => clean(cell.innerText));
  const numericCells = cells
    .map((cell) => Number(cell))
    .filter((value) => Number.isInteger(value) && value > 0 && value < 10000);
  return numericCells.length ? numericCells[numericCells.length - 1] : "";
}

function inferInstituteName(cells, text) {
  const bestCell = cells.find(cell => /college|institute|aiims|jipmer|medical|dental|hospital|university/i.test(cell));
  if (bestCell) return stripFeeText(bestCell);
  const lines = text.split("\n").map(stripFeeText).filter(Boolean);
  return lines.find(line => !BUTTON_TEXT.test(line) && line.length > 5) || "";
}

function inferProgramName(cells) {
  return cells.find(cell => /mbbs|bds|science|design|degree/i.test(cell)) || "";
}

function textSimilarity(left, right) {
  const lk = normalize(left), rk = normalize(right);
  if (!lk || !rk) return 0;
  if (lk === rk) return 1;
  if (lk.includes(rk) || rk.includes(lk)) return 0.94;
  const lt = new Set(lk.split(" ").filter(Boolean));
  const rt = new Set(rk.split(" ").filter(Boolean));
  const overlap = [...lt].filter(t => rt.has(t)).length;
  const precision = overlap / Math.max(1, Math.min(lt.size, rt.size));
  const union = new Set([...lt, ...rt]).size;
  const jaccard = overlap / Math.max(1, union);
  return (precision * 0.65) + (jaccard * 0.35);
}

function markRow(row) {
  if (!row) return;
  row.style.outline = "3px solid #0b7894";
  row.style.outlineOffset = "-3px";
}

function getRajasthanControls() {
  const root = document.querySelector(".choice-filling-cover") || document;
  const selects = [...root.querySelectorAll("ul.filter select, select.form-select, select")];
  const instituteSelect = selects.find((select) =>
    [...select.options].some((option) => /select your institute/i.test(option.textContent))
  ) || selects[0] || null;
  const courseSelect = selects.find((select) =>
    [...select.options].some((option) => /select your course/i.test(option.textContent) || /^mbbs$/i.test(clean(option.textContent)))
  ) || selects[1] || null;
  const seatSelect = selects.find((select) =>
    [...select.options].some((option) => /seat type|management|government|general/i.test(option.textContent))
  ) || selects[2] || null;
  return { instituteSelect, courseSelect, seatSelect };
}

function selectableOptions(select) {
  if (!select) return [];
  return [...select.options].filter((option) => option.value && clean(option.textContent));
}

function findOptionByText(select, text) {
  const target = normalizeMedicalProgram(text);
  return selectableOptions(select).find((option) => normalizeMedicalProgram(option.textContent) === target) || null;
}

function findRajasthanSeatOption(select, desiredSeat) {
  const normalizedDesired = normalizeRajasthanSeatLabel(desiredSeat);
  return selectableOptions(select).find((option) => normalizeRajasthanSeatLabel(option.textContent || option.value) === normalizedDesired) || null;
}

function hasRajasthanDynamicSearchInput() {
  const root = document.querySelector(".choice-filling-cover") || document;
  const controls = getRajasthanControls();
  return Boolean(controls.instituteSelect ||
    root.querySelector("input[type='search'], input[type='text'], input[role='combobox'], .ng-input input, [role='combobox']"));
}

async function searchAndSelectRajasthanInstitute(searchText) {
  const controls = getRajasthanControls();
  const instituteSelect = controls.instituteSelect;
  const exactOption = bestInstituteOption(selectableOptions(instituteSelect), searchText);
  if (exactOption) {
    setSelectValue(instituteSelect, exactOption.value);
    return true;
  }

  const root = document.querySelector(".choice-filling-cover") || document;
  const filterItems = [...root.querySelectorAll("ul.filter li, .filter li, .filter .nav-item")];
  const instituteFilter = filterItems.find((item) => item.contains(instituteSelect)) || filterItems[0] || root;
  const clickable = instituteFilter.querySelector(".ng-select-container, .select2-selection, [role='combobox'], input, select") || instituteSelect;
  clickable?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  clickable?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await wait(250);

  const input = instituteFilter.querySelector("input[type='search'], input[type='text'], input[role='combobox'], .ng-input input") ||
    document.querySelector(".ng-dropdown-panel input, [role='listbox'] input, input[aria-autocomplete]");
  if (input) {
    input.focus();
    input.value = searchText;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(1800);
  }

  const refreshedOption = bestInstituteOption(selectableOptions(instituteSelect), searchText);
  if (refreshedOption) {
    setSelectValue(instituteSelect, refreshedOption.value);
    return true;
  }

  const dropdownOptions = [...document.querySelectorAll(".ng-option, [role='option'], mat-option, .select2-results__option, .dropdown-item, .dropdown-menu li, ul li")]
    .filter((item) => clean(item.textContent) && !/select your institute/i.test(item.textContent));
  const bestDropdown = dropdownOptions
    .map((item) => ({ item, score: textSimilarityMedical(searchText, item.textContent) }))
    .sort((a, b) => b.score - a.score)[0];
  if (bestDropdown && bestDropdown.score >= 0.90) {
    bestDropdown.item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    bestDropdown.item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await wait(900);
    return true;
  }

  return false;
}

function bestInstituteOption(options, searchText) {
  const scored = options
    .map((option) => ({ option, score: textSimilarityMedical(searchText, option.textContent) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  if (!best) return null;
  const gap = second ? best.score - second.score : 1;
  return best.score >= 0.90 && gap >= 0.06 ? best.option : null;
}

function setSelectValue(select, value) {
  select.value = value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function desiredRajasthanSeat(value) {
  const text = String(value || "");
  if (/\b(general|government|govt)\b/i.test(text)) return "Government";
  if (/\b(management|mgmt)\b/i.test(text)) return "Management";
  return "Management";
}

function normalizeRajasthanSeatLabel(value) {
  const text = String(value || "");
  if (/\b(general|government|govt)\b/i.test(text)) return "Government";
  if (/\b(management|mgmt)\b/i.test(text)) return "Management";
  return clean(text);
}

function isMcc() {
  return location.hostname === MCC_HOST || Boolean(document.querySelector("#avlChoiceContainer .quota"));
}

function isRajasthan() {
  return Boolean(document.querySelector(".choice-filling-cover .available-choice") &&
    document.querySelector(".choice-filling-cover .filled-choice"));
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripFeeText(value) {
  return clean(value).replace(/view fee detail/ig, "").replace(/view orcr/ig, "").trim();
}

function stripActionText(cell) {
  if (!cell) return "";
  const clone = cell.cloneNode(true);
  clone.querySelectorAll("input, button, a").forEach((item) => item.remove());
  return stripFeeText(clone.textContent).replace(/\s*Institute Address:\s*[\s\S]*$/i, "").trim();
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\blntelligence\b/g, "intelligence")
    .replace(/\bm\.?sc\.?\b/g, "master science")
    .replace(/\bb\.?sc\.?\b/g, "bachelor science")
    .replace(/\bph\.?d\.?\b/g, "doctor philosophy")
    .replace(/\baiims\b/g, "all india institute medical sciences")
    .replace(/\bjipmer\b/g, "jawaharlal institute postgraduate medical education research")
    .replace(/\bgmc\b/g, "government medical college")
    .replace(/\bafmc\b/g, "armed forces medical college")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|of|and|in|at|for|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMedical(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\bmedial\b/g, "medical")
    .replace(/\bmed\b/g, "medical")
    .replace(/\binstitue\b/g, "institute")
    .replace(/\binst\b/g, "institute")
    .replace(/\brch\b/g, "research")
    .replace(/\bgovt\b/g, "government")
    .replace(/\bgov\.\b/g, "government")
    .replace(/\bmc\b/g, "medical college")
    .replace(/\bm\.c\b/g, "medical college")
    .replace(/\bgmc\b/g, "government medical college")
    .replace(/\baiims\b/g, "all india institute medical sciences")
    .replace(/\bjipmer\b/g, "jawaharlal institute postgraduate medical education research")
    .replace(/\bjnu\b/g, "jaipur national university")
    .replace(/\bjln\b/g, "jawaharlal nehru")
    .replace(/\brml\b/g, "ram manohar lohia")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsms\b/g, "sawai man singh")
    .replace(/\bs m s\b/g, "sawai man singh")
    .replace(/\brnt\b/g, "ravindra nath tagore")
    .replace(/\br n t\b/g, "ravindra nath tagore")
    .replace(/\bsk\b/g, "shri kalyan")
    .replace(/\bs k\b/g, "shri kalyan")
    .replace(/\bsn\b/g, "sarojini naidu")
    .replace(/\bs n\b/g, "sarojini naidu")
    .replace(/\bbj\b/g, "byramjee jeejeebhoy")
    .replace(/\bb j\b/g, "byramjee jeejeebhoy")
    .replace(/\bgs\b/g, "gordhandas sunderdas")
    .replace(/\bg s\b/g, "gordhandas sunderdas")
    .replace(/\bgr\b/g, "gajra raja")
    .replace(/\bg r\b/g, "gajra raja")
    .replace(/\bscb\b/g, "srirama chandra bhanja")
    .replace(/\bs c b\b/g, "srirama chandra bhanja")
    .replace(/\bucms\b/g, "university sciences")
    .replace(/\br g kar\b/g, "radha gobinda kar")
    .replace(/\b(the|of|and|in|at|for|a|an|college|medical|institute|hospital|government|govt)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMedicalProgram(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\bbachelor of dental surgery\b/g, "bds")
    .replace(/\bbachelor of medicine\b.*\bbachelor of surgery\b/g, "mbbs")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericPlaceName(value) {
  const text = normalizeMedical(value);
  if (!text) return false;
  const genericPlaces = new Set([
    "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "delhi",
    "new delhi", "goa", "gujarat", "haryana", "himachal pradesh", "jammu kashmir",
    "jharkhand", "karnataka", "kerala", "madhya pradesh", "maharashtra", "manipur",
    "meghalaya", "mizoram", "nagaland", "odisha", "orissa", "punjab", "rajasthan",
    "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand",
    "west bengal", "chandigarh", "puducherry", "pondicherry"
  ]);
  return genericPlaces.has(text);
}

function normalizeQuota(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\bai\b/g, "all india")
    .replace(/\bso\b/g, "open seat quota")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|of|and|in|at|for|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textSimilarityMedical(left, right) {
  return textSimilarity(normalizeMedical(left), normalizeMedical(right));
}

function namesMatchStrict(left, right) {
  const ln = normalizeMedical(left);
  const rn = normalizeMedical(right);
  if (!ln || !rn) return false;
  if (ln === rn) return true;
  return textSimilarityMedical(left, right) >= 0.92;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

})();
