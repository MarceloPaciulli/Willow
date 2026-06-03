/*
 * Willow.js - JSON Tree Viewer
 * Author: Marcelo A. Paciulli
 * Version: 1.0.0
 */



let data = {};
let historyStack = [];
let redoStack = [];
let currentColor = "#000000";
let currentKeyColor = "#000000";
let currentFontSize = 16;
let currentFontFamily = "Courier New, monospace";
let isBold = false;
let hasLoadedFile = false;
let userChangedColor = false;
let userChangedKeyColor = false;
let showTypeLabels = false;
let rawJsonText = "";
let selectedPath = "$";

const MAX_FONT_SIZE = 21;
const MIN_FONT_SIZE = 16;

let jsonStats = {
	objects: 0,
	arrays: 0,
	keys: 0,
	depth: 0,
	size: 0
};

const iconsMap = {
	folder: ["📁", "📂"],
	plus: ["➕", "➖"],
	arrow: ["▶️", "🔽"],
	terminal: ["⯈", "⯆"],
};

let currentCategory = "folder";

function setTreeState(hasData) {
	const wrapper = document.getElementById("treeWrapper");
	if (!wrapper) return;
	wrapper.classList.toggle("empty", !hasData);
}

function analyzeJSON(node) {
	let objects = 0;
	let arrays = 0;
	let keys = 0;
	let maxDepth = 0;

	function walk(n, depth = 0) {
		maxDepth = Math.max(maxDepth, depth);

		if (Array.isArray(n)) {
			arrays++;
			for (const v of n) walk(v, depth + 1);
			return;
		}

		if (n && typeof n === "object") {
			objects++;
			const k = Object.keys(n);
			keys += k.length;
			for (const key of k) walk(n[key], depth + 1);
		}
	}

	walk(node);
	return {
		objects,
		arrays,
		keys,
		depth: maxDepth,
		size: 0
	};
}

function formatBytes(bytes) {
	if (!bytes || isNaN(bytes)) return "0 B";

	if (bytes < 1024) return bytes + " B";
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
	return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}



function renderStats(stats) {
	let box = document.getElementById("statsBox");
	const wrapper = document.getElementById("treeWrapper");

	if (!box) {
		box = document.createElement("div");
		box.id = "statsBox";
	}

	if (box.parentElement !== wrapper && wrapper) {
		wrapper.appendChild(box);
	}

	box.style.display = "block";

	box.innerHTML =
		"Objects: " + stats.objects + "<br>" +
		"Arrays: " + stats.arrays + "<br>" +
		"Keys: " + stats.keys + "<br>" +
		"Depth: " + stats.depth + "<br>" +
		"Size: " + formatBytes(stats.size);
}


function renumberVisibleNodes() {
	let counter = 1;
	const container = document.getElementById("tree");
	if (!container) return;

	const stack = [container.firstElementChild];
	if (!stack[0]) return;

	while (stack.length) {
		const el = stack.pop();
		if (!el) continue;

		if (el.nodeType === 1 && el.style.display === "none") continue;

		if (el.tagName === "LI") {
			el.dataset.num = counter++;
		}

		let child = el.lastElementChild;
		while (child) {
			stack.push(child);
			child = child.previousElementSibling;
		}
	}
}

function createTree(obj, level = 0, parentPath = "$") {
	const ul = document.createElement("ul");
	if (Array.isArray(obj) && obj.length === 0) {
		const ul = document.createElement("ul");


		return ul;
	}

	if (Array.isArray(obj)) {
		if (obj.length === 0) {
			const li = document.createElement("li");
			const keySpan = document.createElement("span");
			const valueSpan = document.createElement("span");

			li.className = "leaf";
			li.dataset.level = level;

			keySpan.textContent = "[]";
			keySpan.className = "key";

			valueSpan.textContent = "[]";

			applyStyles(keySpan, currentKeyColor);
			applyStyles(valueSpan, currentColor);

			li.appendChild(keySpan);
			li.appendChild(valueSpan);
			ul.appendChild(li);
			return ul;
		}

		const frag = document.createDocumentFragment();

		obj.forEach((item, i) => {
			const currentPath = `${parentPath}[${i}]`;
			const li = document.createElement("li");
			li.dataset.level = level;

			if (item && typeof item === "object") {
				const span = document.createElement("span");
				const child = createTree(item, level + 1, currentPath);

				span.dataset.rawKey = "[" + i + "]";
				span.dataset.type = Array.isArray(item) ? "array" : "object";
				span.dataset.path = currentPath;

				span.className = "node";
				span.textContent =
					iconsMap[currentCategory][0] +
					" [" + i + "]" +
					getTypeLabel(item);

				applyStyles(span, currentColor);

				child.style.display = "none";

				span.onclick = () => {
					selectedPath = span.dataset.path || "$";
					saveState();
					const isOpen = child.style.display === "none";
					child.style.display = isOpen ? "block" : "none";

					span.textContent =
						(isOpen ? iconsMap[currentCategory][1] : iconsMap[currentCategory][0]) +
						" [" + i + "]" +
						getTypeLabel(item);

					requestAnimationFrame(renumberVisibleNodes);
				};

				li.appendChild(span);
				li.appendChild(child);

			} else {
				li.className = "leaf";
				li.dataset.path = currentPath;
				li.onclick = e => {
					e.stopPropagation();
					selectedPath = li.dataset.path || "$";
				};

				const indexSpan = document.createElement("span");
				const valueSpan = document.createElement("span");

				indexSpan.textContent = "[" + i + "] ";
				indexSpan.className = "array-index";
                                applyStyles(indexSpan, currentColor);

				valueSpan.textContent =
					typeof item === "string" ? "\"" + item + "\"" : item;

				valueSpan.className = "array-value";

				applyStyles(valueSpan, currentColor);

				li.appendChild(indexSpan);
				li.appendChild(valueSpan);
			}

			frag.appendChild(li);
		});

		ul.appendChild(frag);
		return ul;
	}

	const frag = document.createDocumentFragment();

	for (const key in obj) {
		const currentPath = `${parentPath}.${key}`;
		const li = document.createElement("li");
		const value = obj[key];

		li.dataset.level = level;

		const isEmptyArray = Array.isArray(value) && value.length === 0;
		const isEmptyObject =
			value &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			Object.keys(value).length === 0;

		if (value && typeof value === "object" && !isEmptyArray && !isEmptyObject) {
			const span = document.createElement("span");
			const child = createTree(value, level + 1, currentPath);

			span.dataset.rawKey = key;
			span.dataset.type = Array.isArray(value) ? "array" : "object";
			span.dataset.path = currentPath;
			span.className = "node";

			span.textContent =
				iconsMap[currentCategory][0] + " " + key + getTypeLabel(value);

			applyStyles(span, currentColor);

			child.style.display = "none";

			span.onclick = () => {
				selectedPath = span.dataset.path || "$";
				saveState();
				const isOpen = child.style.display === "none";
				child.style.display = isOpen ? "block" : "none";

				span.textContent =
					(isOpen ? iconsMap[currentCategory][1] : iconsMap[currentCategory][0]) +
					" " + key + getTypeLabel(value);

				requestAnimationFrame(renumberVisibleNodes);
			};

			li.appendChild(span);
			li.appendChild(child);

		} else {
			li.className = "leaf";
			li.dataset.path = currentPath;
			li.onclick = e => {
				e.stopPropagation();
				selectedPath = li.dataset.path || "$";
			};

			const keySpan = document.createElement("span");
			const valueSpan = document.createElement("span");

			keySpan.textContent = key + ": ";
			keySpan.className = "key";

			if (isEmptyArray) valueSpan.textContent = "[]";
			else if (isEmptyObject) valueSpan.textContent = "{}";
			else valueSpan.textContent = value;

			applyStyles(keySpan, currentKeyColor);
			applyStyles(valueSpan, currentColor);

			li.appendChild(keySpan);
			li.appendChild(valueSpan);
		}

		frag.appendChild(li);
	}

	ul.appendChild(frag);
	return ul;
}

function applyStyles(el, color) {
	el.style.color = color;
	el.style.fontSize = currentFontSize + "px";
	el.style.fontFamily = currentFontFamily;
}

function renderTree() {
	const container = document.getElementById("treeRoot");
	if (!container) return;

	container.innerHTML = "";

	const rootLi = document.createElement("li");
	const rootSpan = document.createElement("span");
	const childTree = createTree(data);

	rootSpan.dataset.type = Array.isArray(data) ? "array" : "object";
	rootSpan.className = "node";

	const icon = iconsMap[currentCategory][1];

	rootSpan.textContent = icon + getTypeLabel(data);
	applyStyles(rootSpan, currentColor);

	childTree.style.display = "block";

	rootSpan.onclick = () => {
		selectedPath = rootSpan.dataset.path || "$";
		saveState();
		const isOpen = childTree.style.display === "none";
		childTree.style.display = isOpen ? "block" : "none";

		const icon = isOpen ?
			iconsMap[currentCategory][1] :
			iconsMap[currentCategory][0];

		rootSpan.textContent = showTypeLabels ?
			icon + getTypeLabel(data) :
			icon;

		requestAnimationFrame(renumberVisibleNodes);
	};

	rootLi.appendChild(rootSpan);
	rootLi.appendChild(childTree);
	container.appendChild(rootLi);

	if (hasLoadedFile && data) {
		jsonStats = analyzeJSON(data);
		jsonStats.size = new Blob([rawJsonText.replace(/^\uFEFF/, "")]).size;
		renderStats(jsonStats);
	} else {
		const box = document.getElementById("statsBox");
		if (box) box.style.display = "none";
	}
	requestAnimationFrame(() => {
		renumberVisibleNodes();
		autoAdjustColor();
	});
        applyBoldToAll();
}

function saveState() {
	const state = [...document.querySelectorAll("ul ul")].map(el => el.style.display);
	historyStack.push(state);
	redoStack = [];
}

function undo() {
	if (!historyStack.length) return;
	const prev = historyStack.pop();
	redoStack.push([...document.querySelectorAll("ul ul")].map(el => el.style.display));

	document.querySelectorAll("ul ul").forEach((el, i) => {
		el.style.display = prev[i];
	});

	updateAllNodeIcons();
	renumberVisibleNodes();
}

function redo() {
	if (!redoStack.length) return;
	const next = redoStack.pop();
	historyStack.push([...document.querySelectorAll("ul ul")].map(el => el.style.display));

	document.querySelectorAll("ul ul").forEach((el, i) => {
		el.style.display = next[i];
	});

	updateAllNodeIcons();
	renumberVisibleNodes();
}


function updateAllNodeIcons() {
        applyBoldToAll();

	document.querySelectorAll(".node").forEach(el => {

		const child = Array.from(el.parentElement.children)
			.find(c => c.tagName === "UL");

		const rawKey = el.dataset.rawKey || "";
		const type = el.dataset.type;

		const isOpen =
			child &&
			getComputedStyle(child).display !== "none";

		const icon = isOpen ?
			iconsMap[currentCategory][1] :
			iconsMap[currentCategory][0];

		let label = rawKey;

		if (showTypeLabels && type) {
			label += ` (${type})`;
		}

		if (rawKey) {
			el.textContent = `${icon} ${label}`;
		} else {
			el.textContent = `${icon}${label}`;
		}
	});
}

function searchTree() {
	const term = document.getElementById("search").value.toLowerCase();
	document.querySelectorAll("li").forEach(li => {
		li.style.display = li.textContent.toLowerCase().includes(term) || term === "" ? "block" : "none";
	});
}

function updateColor() {
	currentColor = document.getElementById("colorPicker").value;
	userChangedColor = true;

	document.querySelectorAll(".leaf span:not(.key):not(.array-index)")
		.forEach(el => el.style.color = currentColor);
}

function updateKeyColor() {
	currentKeyColor = document.getElementById("keyColorPicker").value;
	userChangedKeyColor = true;

	document.querySelectorAll(".key")
		.forEach(el => el.style.color = currentKeyColor);
}


function updateFontSize() {
	let val = parseInt(document.getElementById("fontSize").value);

	if (val > MAX_FONT_SIZE) val = MAX_FONT_SIZE;
	if (val < MIN_FONT_SIZE) val = MIN_FONT_SIZE;

	currentFontSize = val;

	document.getElementById("fontSize").value = val;

	document.querySelectorAll(".node, .leaf span")
		.forEach(el => el.style.fontSize = currentFontSize + "px");
}

function updateFontFamily() {
	currentFontFamily = document.getElementById("fontSelect").value;
	localStorage.setItem("jsonFontFamily", currentFontFamily);

	document.querySelectorAll(".node, .leaf span")
		.forEach(el => el.style.fontFamily = currentFontFamily);
}

function loadFontPreference() {
	const saved = localStorage.getItem("jsonFontFamily");
	if (saved) {
		currentFontFamily = saved;
		document.getElementById("fontSelect").value = saved;
	}
}

function getTypeLabel(value) {
	if (!showTypeLabels) return "";
	if (Array.isArray(value)) return " (array)";
	if (value && typeof value === "object") return " (object)";
	return "";
}

function toggleTypeLabels() {
	document.querySelectorAll(".node").forEach(el => {
		const icon = el.textContent.split(" ")[0] + " ";
		const label = el.dataset.rawKey || "";
		const type = el.dataset.type;

		el.textContent = showTypeLabels && type ? icon + label + " (" + type + ")" : icon + label;
	});
}

function updateIcons() {
	currentCategory = document.getElementById("iconSelect").value;
	updateAllNodeIcons();
}

function handleFileUpload(e) {
	const file = e.target.files[0];
	if (!file) return;

	showLoading();

	const reader = new FileReader();

	reader.onload = function(event) {
		loadJSONFromText(event.target.result);
	};

	reader.onerror = function(event) {
		hideLoading();

		const error = event?.target?.error;

		showErrorModal(
			"Error reading file. Please check it",
			error
		);
	};

	reader.onloadend = function() {
		hideLoading();
	};

	reader.readAsText(file);
	e.target.value = "";
}


async function handleUrlUpload() {
	const url = document.getElementById("urlInput").value.trim();

	if (!url) {
		return showErrorModal(
			"Enter a valid URL",
			new Error("URL input is empty")
		);
	}

	showLoading();

	const controller = new AbortController();
	const timeoutMs = 60000;

	const timeout = setTimeout(() => {
		controller.abort();
	}, timeoutMs);

	try {
		const res = await fetch(url, { signal: controller.signal });

		if (!res.ok) {
			throw new Error(`HTTP error: ${res.status}`);
		}

		const text = await res.text();
		loadJSONFromText(text);

	} catch (e) {

		let message = "Error loading URL. Please check the link or JSON format.";

		if (e?.name === "AbortError") {
			message = `Request timed out after ${timeoutMs / 1000} seconds.`;
		}

		await new Promise(requestAnimationFrame);

		showErrorModal(
			message,
			e instanceof Error ? e : new Error(String(e))
		);

	} finally {
		clearTimeout(timeout);
		hideLoading();
	}
}


function setDark() {
	document.body.classList.remove("light");
	document.body.classList.add("dark");
	localStorage.setItem("theme", "dark");
	autoAdjustColor();
}

function setLight() {
	document.body.classList.remove("dark");
	document.body.classList.add("light");
	localStorage.setItem("theme", "light");
	autoAdjustColor();
}

function loadTheme() {
	const theme = localStorage.getItem("theme") || "dark";
	document.body.className = theme;
	autoAdjustColor();
}

function repaintTreeColors() {
	document.querySelectorAll(".leaf span:not(.key):not(.array-index)")
		.forEach(el => el.style.color = currentColor);

	document.querySelectorAll(".key")
		.forEach(el => el.style.color = currentKeyColor);
}

function autoAdjustColor() {
	const theme = document.body.classList.contains("dark") ? "dark" : "light";

        if (!userChangedColor) {
                currentColor = theme === "dark" ? "#00ff9c" : "#00a86b";
                document.getElementById("colorPicker").value = currentColor;
        }

	if (!userChangedKeyColor) {
		currentKeyColor = theme === "dark" ? "#4FC3F7" : "#1976D2";
		document.getElementById("keyColorPicker").value = currentKeyColor;
	}

	repaintTreeColors();

	const nodeColor = theme === "dark" ? "#ffffff" : "#000000";
	document.querySelectorAll(".node").forEach(el => el.style.color = nodeColor);
}

function expandAll() {
        const LIMIT_MB = 5.5;
	const sizeMB = jsonStats.size / (1024 * 1024);

	if (sizeMB > LIMIT_MB) {

		showErrorModal(
			"Expand All is disabled for large JSON files.",
			new Error("Size file: " + sizeMB.toFixed(2) + " MB")
		);

		return;
	}

	saveState();

	showLoading();

	const nodes = Array.from(document.querySelectorAll("ul ul"));
	let index = 0;
	const chunkSize = 300;

	let spinnerHidden = false;

	function processChunk() {
		const end = Math.min(index + chunkSize, nodes.length);


		for (let i = index; i < end; i++) {

			const node = nodes[i];

			node.style.display = "block";

			const parentLi = node.parentElement;

			if (!parentLi) continue;

			const span = parentLi.querySelector(":scope > .node");

			if (!span) continue;

			const rawKey = span.dataset.rawKey || "";
			const type = span.dataset.type;

			let label = rawKey;

			if (showTypeLabels && type) {
				label += ` (${type})`;
			}

			const icon = iconsMap[currentCategory][1];

			span.textContent = rawKey ?
				`${icon} ${label}` :
				`${icon}${label}`;
		}

		index = end;

		if (!spinnerHidden && index > nodes.length * 0.3) {
			hideLoading();
			spinnerHidden = true;
		}

		if (index < nodes.length) {
			requestAnimationFrame(processChunk);
		} else {
			updateAllNodeIcons();
			renumberVisibleNodes();
			if (!spinnerHidden) hideLoading();
		}
	}

	requestAnimationFrame(processChunk);
}


function collapseAll() {
	saveState();

	showLoading();

	requestAnimationFrame(() => {
		document.querySelectorAll("ul ul")
			.forEach(el => el.style.display = "none");

		updateAllNodeIcons();
		renumberVisibleNodes();

		hideLoading();
	});
}



function toggleNumbers() {
	const nodes = Array.from(document.querySelectorAll("li"));

	showLoading();

	let index = 0;
	const chunkSize = 300;
	const hide = !document.body.classList.contains("hide-numbers");

	function processChunk() {
		const end = Math.min(index + chunkSize, nodes.length);

		for (let i = index; i < end; i++) {
			if (hide) {
				nodes[i].classList.add("hide-num");
			} else {
				nodes[i].classList.remove("hide-num");
			}
		}

		index = end;

		if (index < nodes.length) {
			requestAnimationFrame(processChunk);
		} else {
			document.body.classList.toggle("hide-numbers");
			hideLoading();
		}
	}

	requestAnimationFrame(processChunk);
}

function getOpenState() {
	return [...document.querySelectorAll("ul ul")].map(el => el.style.display === "block");
}

function restoreOpenState(state) {
	const nodes = document.querySelectorAll("ul ul");

	nodes.forEach((el, i) => {
		if (state[i] !== undefined) {
			el.style.display = state[i] ? "block" : "none";
		}
	});

	updateAllNodeIcons();
	renumberVisibleNodes();
}

function handleDroppedFile(file) {
	if (!file) return;

	showLoading();

	const reader = new FileReader();

	reader.onload = e => {
		loadJSONFromText(e.target.result);
	};

	reader.readAsText(file);
}

function showLoading() {
	document.getElementById("loading")?.classList.remove("hidden");
	document.getElementById("treeWrapper")?.classList.add("loading");
}

function hideLoading() {
	document.getElementById("loading")?.classList.add("hidden");
	document.getElementById("treeWrapper")?.classList.remove("loading");
}

function toggleBold() {
	isBold = !isBold;
        applyBoldToAll();

	document.querySelectorAll(".node, .leaf span")
		.forEach(el => {
			el.style.fontWeight = isBold ? "bold" : "normal";
		});
}

function applyBoldToAll() {
	document.querySelectorAll(".node, .leaf span")
		.forEach(el => {
			el.style.fontWeight = isBold ? "bold" : "normal";
		});
}

function openPathModal() {
	document.getElementById("pathInput").value = selectedPath;
	document.getElementById("pathModal").classList.remove("hidden");
}

function closePathModal() {
	document.getElementById("pathModal").classList.add("hidden");
}

function copyPath() {
	navigator.clipboard.writeText(selectedPath);
}

function showErrorModal(message, error = null) {
    hideLoading();

    requestAnimationFrame(() => {
        const modal = document.getElementById("errorModal");
        const msg = document.getElementById("errorMessage");
        const details = document.getElementById("errorDetailsText");

        msg.textContent = message;

        details.textContent = error instanceof Error
            ? error.message
            : String(error || "");

        modal.classList.remove("hidden");
    });
}
function closeErrorModal() {
	document.getElementById("errorModal").classList.add("hidden");

	const details = document.querySelector(".error-details");
	if (details) {
		details.open = true;
	}
}

function loadJSONFromText(text, sizeOverride = null) {
	try {
		const cleanedText = text.replace(/^\uFEFF/, "");
		const parsed = JSON.parse(cleanedText);

		data = parsed;
		rawJsonText = cleanedText;
		hasLoadedFile = true;

		jsonStats = analyzeJSON(parsed);
		jsonStats.size = sizeOverride ?? getSizeFromText(text);

		renderTree();
		setTreeState(true);

	} catch (err) {
		console.error("JSON parse error:", err);
		showErrorModal("The JSON is not valid. Please check the format.", err);
	} finally {
		hideLoading();
	}
}

function getSizeFromText(text) {
	return new TextEncoder().encode(text).length;
}


function goToBottom() {
	const wrapper = document.getElementById("treeWrapper");

	if (!wrapper) return;

	wrapper.scrollTo({
		top: wrapper.scrollHeight,
		behavior: "smooth"
	});
}

function goToTop() {
	const wrapper = document.getElementById("treeWrapper");

	if (!wrapper) return;

	wrapper.scrollTo({
		top: 0,
		behavior: "smooth"
	});
}

document.addEventListener("DOMContentLoaded", () => {

	setTimeout(() => document.body.classList.add("hide-numbers"), 0);

	currentCategory = document.getElementById("iconSelect").value;

	document.getElementById("btnTypes").addEventListener("click", () => {
		showTypeLabels = !showTypeLabels;
		toggleTypeLabels();
	});
	document.getElementById("btnPath").addEventListener("click", openPathModal);
	document.getElementById("closePathBtn").addEventListener("click", closePathModal);
	document.getElementById("copyPathBtn").addEventListener("click", copyPath);
	document.getElementById("closeErrorBtn").addEventListener("click", closeErrorModal);
	document.getElementById("btnBold").addEventListener("click", toggleBold);

	document.getElementById("btnDark").addEventListener("click", setDark);
	document.getElementById("btnLight").addEventListener("click", setLight);
	document.getElementById("btnExpand").addEventListener("click", expandAll);
	document.getElementById("btnCollapse").addEventListener("click", collapseAll);
	document.getElementById("btnUndo").addEventListener("click", undo);
	document.getElementById("btnRedo").addEventListener("click", redo);

	document.getElementById("btnGoBottom").addEventListener("click", goToBottom);
	document.getElementById("btnGoTop").addEventListener("click", goToTop);

	document.getElementById("search").addEventListener("input", searchTree);
	document.getElementById("colorPicker").addEventListener("change", updateColor);
	document.getElementById("keyColorPicker").addEventListener("change", updateKeyColor);
	document.getElementById("fontSize").addEventListener("change", updateFontSize);
	document.getElementById("iconSelect").addEventListener("change", updateIcons);
	document.getElementById("fileInput").addEventListener("change", handleFileUpload);
	//document.getElementById("btnNumbers").addEventListener("click", toggleNumbers);

	const btnLoadUrl = document.getElementById("btnLoadUrl");
	if (btnLoadUrl) {
		btnLoadUrl.addEventListener("click", handleUrlUpload);
	}
	const urlInput = document.getElementById("urlInput");

	if (urlInput) {
		urlInput.addEventListener("keydown", e => {
			if (e.key === "Enter") {
				handleUrlUpload();
			}
		});
	}

	document.getElementById("fontSelect").addEventListener("change", updateFontFamily);
	document.addEventListener("paste", (e) => {
		const text = e.clipboardData?.getData("text");
		if (!text) return;

		if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

		showLoading();

		setTimeout(() => {
			loadJSONFromText(text);
		}, 0);
	});
	document.addEventListener("dragover", e => e.preventDefault());

	document.addEventListener("drop", e => {
		e.preventDefault();

		const file = e.dataTransfer.files[0];
		if (!file) return;

		if (file.type && file.type !== "application/json" && !file.name.endsWith(".json")) {
			showErrorModal("Please, drop a JSON file");
			return;
		}

		handleDroppedFile(file);
	});

	loadTheme();
	loadFontPreference();
	setTreeState(false);
	renderTree();
});