const form = document.getElementById('plannerForm');
const statusMessage = document.getElementById('statusMessage');
const generateButton = document.getElementById('generateButton');
const results = document.getElementById('results');
const savePlanButton = document.getElementById('savePlanButton');
const savedPlanList = document.getElementById('savedPlanList');
const colorInput = document.getElementById('favoriteColor');
const colorSwatch = document.getElementById('colorSwatch');
const colorValue = document.getElementById('colorValue');

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });
const savedPlansKey = 'oshiPlanner.savedPlans.v1';
let savedPlans = loadSavedPlans();
let activePlan = null;

renderSavedPlans();
updateSaveButton();

colorInput.addEventListener('input', () => {
    colorSwatch.style.backgroundColor = colorInput.value;
    colorValue.textContent = colorInput.value.toUpperCase();
    document.documentElement.style.setProperty('--oshi-accent', colorInput.value);
});
colorInput.dispatchEvent(new Event('input'));

form.addEventListener('submit', generatePlan);
savePlanButton.addEventListener('click', saveCurrentPlan);
document.getElementById('editPlanButton').addEventListener('click', () => {
    document.getElementById('form-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('oshiName').focus({ preventScroll: true });
});

async function generatePlan(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const values = new FormData(form);
    const planInput = {
        oshiName: values.get('oshiName').trim(),
        eventName: values.get('eventName').trim(),
        venue: values.get('venue').trim(),
        eventDate: values.get('eventDate'),
        startTime: values.get('startTime'),
        budget: Number(values.get('budget')),
        favoriteColor: colorInput.value,
    };

    if (!Number.isFinite(planInput.budget) || planInput.budget < 1 || planInput.budget > 10000000) {
        showStatus('予算は1円以上、1,000万円以下で入力してください。', true);
        return;
    }

    setLoading(true);
    showStatus('きらきらのプランを考えています…', false);
    results.hidden = true;
    activePlan = null;
    updateSaveButton();

    try {
        const response = await fetch('/api/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: `${planInput.oshiName}の推し活プラン`, ...planInput }),
        });

        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'プランを作成できませんでした。');

        const plan = payload.data;
        validatePlan(plan);
        activePlan = { id: null, plan, input: planInput, title: payload.title || `${planInput.oshiName}の推し活プラン` };
        renderPlan(plan, planInput, activePlan.title);
        updateSaveButton();
        showStatus('プランができました。すてきな一日になりますように ♡', false);
        results.hidden = false;
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
        console.error('Plan generation failed:', error);
        showStatus(error.message || 'プランの作成に失敗しました。時間をおいてもう一度お試しください。', true);
    } finally {
        setLoading(false);
    }
}

function validatePlan(plan) {
    if (!plan || !Array.isArray(plan.schedule) || !plan.schedule.length
        || !Array.isArray(plan.checklist) || !plan.checklist.length
        || !Array.isArray(plan.budget) || !plan.budget.length
        || !Array.isArray(plan.advice) || !plan.advice.length) {
        throw new Error('AIの回答を読み取れませんでした。もう一度お試しください。');
    }
    if (plan.schedule.length < 4 || plan.schedule.length > 7
        || plan.checklist.length < 6 || plan.checklist.length > 10
        || plan.budget.length < 3 || plan.budget.length > 6
        || plan.advice.length < 3 || plan.advice.length > 5) {
        throw new Error('AIの回答数が指定範囲と異なります。もう一度お試しください。');
    }
    if (plan.schedule.some((item) => !item || typeof item.time !== 'string' || typeof item.title !== 'string' || typeof item.detail !== 'string')
        || plan.checklist.some((item) => !item || typeof item.item !== 'string' || typeof item.reason !== 'string')
        || plan.budget.some((item) => !item || typeof item.category !== 'string' || typeof item.note !== 'string')
        || plan.advice.some((item) => typeof item !== 'string')) {
        throw new Error('AIの回答を読み取れませんでした。もう一度お試しください。');
    }
    if (plan.budget.some((item) => !Number.isSafeInteger(item.amount) || item.amount < 0)) {
        throw new Error('予算データを読み取れませんでした。もう一度お試しください。');
    }
}

function renderPlan(plan, input, title, checklistChecked = []) {
    document.documentElement.style.setProperty('--oshi-accent', input.favoriteColor);
    colorInput.value = input.favoriteColor;
    colorSwatch.style.backgroundColor = input.favoriteColor;
    colorValue.textContent = input.favoriteColor.toUpperCase();
    document.getElementById('resultsSubtitle').textContent = `${formatDate(input.eventDate)} · ${input.eventName} · ${input.venue}`;
    const heading = document.getElementById('resultsTitle');
    const headingHeart = document.createElement('span');
    headingHeart.setAttribute('aria-hidden', 'true');
    headingHeart.textContent = ' ♡';
    heading.replaceChildren(document.createTextNode(title || '今日の推し活プラン'), headingHeart);
    renderSchedule(plan.schedule);
    renderChecklist(plan.checklist, checklistChecked);
    renderBudget(plan.budget, input.budget);
    renderAdvice(plan.advice);
}

function renderSchedule(items) {
    const list = document.getElementById('scheduleList');
    list.replaceChildren();
    items.forEach((item) => {
        const entry = document.createElement('li');
        const time = document.createElement('time');
        const content = document.createElement('div');
        const title = document.createElement('strong');
        const detail = document.createElement('p');
        time.textContent = item.time || '目安';
        title.textContent = item.title || '予定';
        detail.textContent = item.detail || '';
        content.append(title, detail);
        entry.append(time, content);
        list.append(entry);
    });
}

function renderChecklist(items, checkedItems = []) {
    const list = document.getElementById('checklist');
    list.replaceChildren();
    items.forEach((item, index) => {
        const entry = document.createElement('li');
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        const text = document.createElement('span');
        const name = document.createElement('strong');
        const reason = document.createElement('small');
        checkbox.type = 'checkbox';
        checkbox.id = `check-item-${index}`;
        checkbox.checked = checkedItems[index] === true;
        name.textContent = item.item || '持ち物';
        reason.textContent = item.reason || '';
        text.append(name, reason);
        label.htmlFor = checkbox.id;
        label.append(checkbox, text);
        entry.append(label);
        list.append(entry);
        checkbox.addEventListener('change', handleChecklistChange);
    });
    updateChecklistProgress();
}

function handleChecklistChange() {
    updateChecklistProgress();
    if (!activePlan || !activePlan.id) return;

    const savedPlan = savedPlans.find((item) => item.id === activePlan.id);
    if (!savedPlan) return;
    savedPlan.checklistChecked = getChecklistChecked();
    try {
        persistSavedPlans();
    } catch (error) {
        console.error('Could not update saved checklist:', error);
        showStatus('チェック状況を保存できませんでした。ブラウザーの保存領域を確認してください。', true);
    }
}

function updateChecklistProgress() {
    const boxes = [...document.querySelectorAll('#checklist input[type="checkbox"]')];
    const checked = boxes.filter((box) => box.checked).length;
    document.getElementById('checkProgress').textContent = `${checked}個 / ${boxes.length}個`;
    document.getElementById('progressFill').style.width = boxes.length ? `${checked / boxes.length * 100}%` : '0%';
}

function renderBudget(items, totalBudget) {
    const list = document.getElementById('budgetList');
    list.replaceChildren();
    const estimatedTotal = items.reduce((sum, item) => sum + item.amount, 0);
    const remaining = totalBudget - estimatedTotal;
    const warning = document.getElementById('budgetWarning');
    const remainingRow = document.querySelector('.budget-remaining');

    document.getElementById('budgetLimit').textContent = yen.format(totalBudget);
    document.getElementById('budgetTotal').textContent = yen.format(estimatedTotal);
    document.getElementById('budgetRemaining').textContent = yen.format(remaining);
    remainingRow.classList.toggle('is-over', remaining < 0);
    warning.hidden = remaining >= 0;
    warning.textContent = remaining < 0
        ? `AIの内訳合計が入力予算を${yen.format(Math.abs(remaining))}超えています。金額や項目を調整してください。`
        : '';

    const colors = ['#b8a0e8', '#d6c8f2', '#9b85cf', '#eadff9', '#c8b7e9', '#a997d7'];
    items.forEach((item, index) => {
        const amount = item.amount;
        const entry = document.createElement('li');
        const top = document.createElement('div');
        const category = document.createElement('strong');
        const value = document.createElement('span');
        const track = document.createElement('span');
        const fill = document.createElement('span');
        const note = document.createElement('small');
        const percent = totalBudget > 0 ? Math.max(0, Math.min(100, amount / totalBudget * 100)) : 0;
        category.textContent = item.category || 'その他';
        value.textContent = yen.format(amount);
        fill.style.width = `${percent}%`;
        fill.style.backgroundColor = colors[index % colors.length];
        note.textContent = item.note || '';
        top.append(category, value);
        track.className = 'budget-track';
        fill.className = 'budget-fill';
        track.append(fill);
        entry.append(top, track, note);
        list.append(entry);
    });
}

function renderAdvice(items) {
    const list = document.getElementById('adviceList');
    list.replaceChildren();
    items.forEach((item) => {
        const entry = document.createElement('li');
        const mark = document.createElement('span');
        const text = document.createElement('p');
        mark.textContent = '✧';
        text.textContent = item;
        entry.append(mark, text);
        list.append(entry);
    });
}

function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(date);
}

function loadSavedPlans() {
    try {
        const stored = localStorage.getItem(savedPlansKey);
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) return [];
        const seenIds = new Set();
        return parsed.map(normalizeSavedPlan).filter((plan) => {
            if (!plan || seenIds.has(plan.id)) return false;
            seenIds.add(plan.id);
            return true;
        });
    } catch (error) {
        console.error('Could not read saved plans:', error);
        return [];
    }
}

function normalizeSavedPlan(record) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id
        || !record.input || typeof record.input !== 'object' || !record.plan || typeof record.plan !== 'object') return null;

    const input = record.input;
    if (typeof input.oshiName !== 'string' || !input.oshiName
        || typeof input.eventName !== 'string' || !input.eventName
        || typeof input.venue !== 'string' || !input.venue
        || typeof input.eventDate !== 'string' || typeof input.startTime !== 'string'
        || !Number.isFinite(input.budget) || input.budget < 1 || input.budget > 10000000
        || typeof input.favoriteColor !== 'string' || !/^#[\da-f]{6}$/i.test(input.favoriteColor)) return null;

    try {
        validatePlan(record.plan);
    } catch {
        return null;
    }

    return {
        id: record.id,
        title: typeof record.title === 'string' && record.title ? record.title : `${input.oshiName}の推し活プラン`,
        input: { ...input },
        plan: record.plan,
        checklistChecked: record.plan.checklist.map((_, index) => Array.isArray(record.checklistChecked) && record.checklistChecked[index] === true),
        savedAt: typeof record.savedAt === 'string' ? record.savedAt : '',
    };
}

function persistSavedPlans() {
    localStorage.setItem(savedPlansKey, JSON.stringify(savedPlans));
}

function renderSavedPlans() {
    savedPlanList.replaceChildren();
    document.getElementById('savedPlanCount').textContent = `${savedPlans.length}件`;

    if (!savedPlans.length) {
        const empty = document.createElement('li');
        empty.className = 'saved-plan-empty';
        empty.textContent = 'まだ保存したプランはありません。AIのプランを作成して保存してね。';
        savedPlanList.append(empty);
        return;
    }

    savedPlans.forEach((plan) => {
        const entry = document.createElement('li');
        const selectButton = document.createElement('button');
        const title = document.createElement('strong');
        const details = document.createElement('span');
        const deleteButton = document.createElement('button');
        entry.className = 'saved-plan-item';
        selectButton.className = 'saved-plan-select';
        selectButton.type = 'button';
        title.textContent = `${plan.input.oshiName} · ${plan.input.eventName}`;
        details.textContent = `${formatDate(plan.input.eventDate)} · ${plan.input.venue} · 予算 ${yen.format(plan.input.budget)}`;
        selectButton.append(title, details);
        selectButton.addEventListener('click', () => openSavedPlan(plan.id));
        deleteButton.className = 'delete-plan-button';
        deleteButton.type = 'button';
        deleteButton.textContent = '削除';
        deleteButton.setAttribute('aria-label', `${plan.input.oshiName}「${plan.input.eventName}」を削除`);
        deleteButton.addEventListener('click', () => deleteSavedPlan(plan.id));
        entry.append(selectButton, deleteButton);
        savedPlanList.append(entry);
    });
}

function openSavedPlan(id) {
    const savedPlan = savedPlans.find((plan) => plan.id === id);
    if (!savedPlan) return;

    activePlan = { id: savedPlan.id, plan: savedPlan.plan, input: savedPlan.input, title: savedPlan.title };
    document.getElementById('oshiName').value = savedPlan.input.oshiName;
    document.getElementById('eventName').value = savedPlan.input.eventName;
    document.getElementById('venue').value = savedPlan.input.venue;
    document.getElementById('eventDate').value = savedPlan.input.eventDate;
    document.getElementById('startTime').value = savedPlan.input.startTime;
    document.getElementById('budget').value = savedPlan.input.budget;
    colorInput.value = savedPlan.input.favoriteColor;
    colorInput.dispatchEvent(new Event('input'));
    renderPlan(savedPlan.plan, savedPlan.input, savedPlan.title, savedPlan.checklistChecked);
    results.hidden = false;
    updateSaveButton();
    showStatus('保存したプランを表示しています。', false);
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function saveCurrentPlan() {
    if (!activePlan || activePlan.id) return;

    const savedPlan = {
        id: createPlanId(),
        title: activePlan.title,
        input: { ...activePlan.input },
        plan: JSON.parse(JSON.stringify(activePlan.plan)),
        checklistChecked: getChecklistChecked(),
        savedAt: new Date().toISOString(),
    };
    savedPlans.unshift(savedPlan);
    try {
        persistSavedPlans();
    } catch (error) {
        savedPlans.shift();
        console.error('Could not save plan:', error);
        showStatus('プランを保存できませんでした。ブラウザーの保存領域を確認してください。', true);
        return;
    }

    activePlan.id = savedPlan.id;
    renderSavedPlans();
    updateSaveButton();
    showStatus('プランを保存しました。持ち物のチェック状況も記録されます。', false);
}

function deleteSavedPlan(id) {
    const index = savedPlans.findIndex((plan) => plan.id === id);
    if (index < 0) return;
    const plan = savedPlans[index];
    const planLabel = `${plan.input.oshiName}「${plan.input.eventName}」`;
    if (!window.confirm(`保存したプラン ${planLabel} を削除しますか？\n削除したプランは元に戻せません。`)) return;

    savedPlans.splice(index, 1);
    try {
        persistSavedPlans();
    } catch (error) {
        savedPlans.splice(index, 0, plan);
        console.error('Could not delete saved plan:', error);
        showStatus('プランを削除できませんでした。ブラウザーの保存領域を確認してください。', true);
        return;
    }

    if (activePlan && activePlan.id === id) {
        activePlan.id = null;
        updateSaveButton();
    }
    renderSavedPlans();
    showStatus('保存したプランを削除しました。', false);
}

function getChecklistChecked() {
    return [...document.querySelectorAll('#checklist input[type="checkbox"]')].map((checkbox) => checkbox.checked);
}

function updateSaveButton() {
    const isSaved = Boolean(activePlan && activePlan.id);
    savePlanButton.disabled = !activePlan || isSaved;
    savePlanButton.textContent = isSaved ? '保存済み ✓' : 'プランを保存 ♡';
}

function createPlanId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function showStatus(message, isError) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle('error', isError);
}

function setLoading(isLoading) {
    generateButton.disabled = isLoading;
    generateButton.setAttribute('aria-busy', String(isLoading));
    generateButton.querySelector('span:first-child').textContent = isLoading ? 'プランを考え中…' : 'わたしのプランを作る';
}
