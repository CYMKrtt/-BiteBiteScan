// app.js - รวมโค้ด JavaScript ของกลุ่ม แบ่งหน้าที่รับผิดชอบเป็นส่วนๆ หากแก้ไขส่วนใดกรุณาระบุชื่อผู้แก้ไขไว้ในคอมเมนต์ด้วย
// ผู้รับผิดชอบแต่ละส่วน: อัญอัญ = CSS/ตกแต่งหน้าเว็บ, โอม = โมเดล AI จดจำอาหาร/อัปโหลดรูป/กล้อง, มัช = โรงเรียน/เมนู, ใบบุญ = ประวัติ/สถิติ

// ตัวแปรที่ใช้ร่วมกันเกือบทุกส่วน เก็บไว้ด้านบนสุดเลย จะได้หาง่าย
var scanHistory = [];
var lastSource = "none"; // "upload" หรือ "camera" หรือ "none"
var hasImage = false;
var cameraStream = null;
var currentImageEl = null; // เก็บ element รูปที่อัปโหลดไว้ เผื่อต้องส่งให้โมเดลตอนกดสแกน
var modelsReady = false;
var toastTimer = null;

var currentMenuSchool = "school1";


// ==================== ส่วนสลับหน้า + ข้อความแจ้งเตือน (อัญอัญ) ====================
// เว็บนี้เป็นแบบหน้าเดียว (Single Page) ใช้ class active ในการซ่อน/แสดงผลแต่ละ section

function showPage(name) {
	// วนดูทุกปุ่มแท็บกับทุก section ว่า id ลงท้ายด้วยชื่อหน้านั้นมั้ย ถ้าใช่ค่อยเปิด active ให้
	var all = document.querySelectorAll(".page, #main-nav .tabbtn");
	for (var i = 0; i < all.length; i++) {
		if (all[i].id.endsWith("-" + name)) {
			all[i].classList.add("active");
		} else {
			all[i].classList.remove("active");
		}
	}
	if (name == "stats") {
		updateStats(); // คำนวณสถิติใหม่ทุกครั้งที่เข้าหน้านี้
	}
	if (name == "history") {
		renderHistory(); // โหลดข้อมูลประวัติใหม่ทุกครั้ง เผื่อมีรายการเพิ่มเข้ามา
	}
}

// กล่องข้อความเล็กๆ ลอยขึ้นมาด้านล่างจอแล้วหายไปเอง ใช้แทน alert จะได้ไม่ต้องกด OK ทุกรอบ
function showToast(text) {
	var toast = document.getElementById("toast");
	toast.textContent = text;
	toast.classList.add("show");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(function () {
		toast.classList.remove("show");
	}, 2500);
}


// ==================== ข้อมูลโรงเรียน (มัช) ====================
// ปัจจุบันรองรับ 2 โรงเรียน หากต้องการเพิ่มโรงเรียนใหม่ให้เพิ่มข้อมูลตรงนี้และที่ defaultMenus ด้านล่าง

var schoolNames = { school1: "โรงเรียน 1", school2: "โรงเรียน 2" };

function schoolLabel(id) {
	if (schoolNames[id]) {
		return schoolNames[id];
	} else {
		return id;
	}
}

// ตรวจสอบว่า radio button ตัวใดถูกเลือกอยู่
function getSelectedSchool() {
	var checked = document.querySelector("input[name=scanSchool]:checked");
	if (checked) {
		return checked.value;
	} else {
		return null;
	}
}

function onSchoolChange() {
	var school = getSelectedSchool();
	if (school) {
		localStorage.setItem("selectedSchool", school); // บันทึกไว้เพื่อไม่ต้องเลือกใหม่ในครั้งถัดไป
	}
	updateTodayPreview();
	updateScanButton();
}

// ตอนเปิดเว็บ ตรวจสอบว่าเคยเลือกโรงเรียนไว้ก่อนหน้านี้หรือไม่
function initSchoolPicker() {
	var saved = localStorage.getItem("selectedSchool");
	if (saved) {
		var radio = document.querySelector("input[name=scanSchool][value=\"" + saved + "\"]");
		if (radio) {
			radio.checked = true;
		}
	}
	updateTodayPreview();
}

// แสดงว่าวันนี้เป็นวันอะไร และโรงเรียนที่เลือกมีเมนูอะไร
function updateTodayPreview() {
	var school = getSelectedSchool();
	var dayKey = getTodayDayKey();
	// ข้อความนี้ไปอยู่ในป้ายเล็กๆ มุมขวาบน เลยเขียนให้สั้นๆ
	var text = "เลือกโรงเรียนเพื่อดูเมนูวันนี้";
	if (school && !dayKey) {
		text = "วันนี้วันหยุด ไม่มีเมนูกลางวัน";
	}
	if (school && dayKey) {
		text = "วัน" + dayLabelTH[dayKey] + "นี้: <b>" + getMenuForDay(school, dayKey) + "</b>";
	}
	document.getElementById("todayMenuPreview").innerHTML = text;
}


// ==================== ประวัติการสแกน (ใบบุญ) ====================
// เก็บข้อมูลใน localStorage เป็น array ของ object โดยแปลงด้วย JSON.stringify และ JSON.parse

function loadHistory() {
	var data = localStorage.getItem("scanHistory");
	if (data) {
		scanHistory = JSON.parse(data);
	} else {
		scanHistory = [];
	}
}

function saveHistory() {
	localStorage.setItem("scanHistory", JSON.stringify(scanHistory));
}

function addHistory(row) {
	scanHistory.push(row);
	saveHistory();
	populateNameDatalist(); // เผื่อมีชื่อใหม่เพิ่มเข้ามา จะได้เลือกซ้ำได้ในครั้งถัดไป
}

// เติมชื่อที่เคยพิมพ์ไปแล้วลงใน datalist เพื่อให้พิมพ์ซ้ำได้ง่ายๆ ไม่ต้องพิมพ์ชื่อเพี้ยนไปมา
function populateNameDatalist() {
	var list = document.getElementById("knownNames");
	list.innerHTML = ""; // ล้างของเก่าก่อน เผื่อฟังก์ชันนี้ถูกเรียกซ้ำ
	var usedName = []; // เก็บชื่อที่ใส่ไปแล้ว กันไม่ให้ซ้ำ วนหาด้วยมือเหมือนที่อื่นในไฟล์นี้ ไม่ใช้ Set
	for (var i = 0; i < scanHistory.length; i++) {
		var n = scanHistory[i].name;
		var already = false;
		for (var j = 0; j < usedName.length; j++) {
			if (usedName[j] == n) {
				already = true;
			}
		}
		if (n != "" && n != "ไม่ระบุชื่อ" && already == false) {
			usedName.push(n);
			var opt = document.createElement("option");
			opt.value = n;
			list.appendChild(opt);
		}
	}
}

// สัดส่วนพลังงานที่ถือว่าสูญเสียของแต่ละระดับกินเหลือ
// สัดส่วนตรงนี้กลุ่มเรากำหนดเองแบบคร่าวๆ (ไม่ได้อิงงานวิจัยไหน) แค่ประมาณว่ากินเหลือมากก็สูญเสียมากตามสัดส่วน
function levelPercent(leftoverLabel) {
	if (leftoverLabel == "กินเหลือเยอะมาก") {
		return 0.9;
	} else if (leftoverLabel == "กินเหลือประมาณนึง") {
		return 0.6;
	} else if (leftoverLabel == "กินเหลือน้อย") {
		return 0.35;
	} else {
		return 0;
	}
}

// แปลงสัดส่วนที่กินเหลือ (0 ถึง 1) เป็นพลังงาน (กิโลแคลอรี่) ที่สูญเสียไปโดยประมาณ เทียบจากแคลของเมนูนั้น
function calcWasteKcal(kcal, wasteRatio) {
	if (kcal == null || wasteRatio == null) {
		return { wasted: null, saved: null };
	}
	var wasted = Math.round(kcal * wasteRatio);
	return { wasted: wasted, saved: kcal - wasted };
}

function clearHistory() {
	if (!confirm("จะล้างประวัติทั้งหมดจริงๆ ใช่มั้ย")) {
		return;
	}
	scanHistory = [];
	localStorage.removeItem("scanHistory");
	renderHistory();
	populateNameDatalist();
	showToast("ล้างประวัติแล้ว");
}

// กำหนด class สีตามสถานะของรายการ เขียนแบบ if-else ยาวๆ ให้เห็นชัดๆ ว่าเช็คอะไรบ้าง
function statusClass(status) {
	if (status == "ตรง") {
		return "status-ok";
	} else if (status == "ไม่ตรง") {
		return "status-warn";
	} else if (status == "ไม่ใช่อาหาร") {
		return "status-error";
	} else if (status == "กินหมดจาน") {
		return "status-ok";
	} else {
		return "status-mid";
	}
}

// สีของระดับกินเหลือ เหลือเยอะ = ส้ม, กินหมด = เขียว, ที่เหลือ = สีกลางๆ
function leftoverClass(label) {
	if (label == leftoverLevels[0]) {
		return "status-warn";
	} else if (label == leftoverLevels[leftoverLevels.length - 1]) {
		return "status-ok";
	} else {
		return "status-mid";
	}
}

// สร้างช่อง td ใส่ข้อความแล้วต่อท้ายแถว ใช้ textContent เผื่อชื่อมีตัวอักษรแปลกๆ หน้าเว็บจะได้ไม่พัง
function addCell(tr, text) {
	var td = document.createElement("td");
	td.textContent = text;
	tr.appendChild(td);
	return td;
}

// ช่องที่เป็นป้ายสีมนๆ (pill) เช่น สถานะ หรือระดับกินเหลือ
function addPillCell(tr, text, className) {
	var td = addCell(tr, "");
	var span = document.createElement("span");
	span.className = "pill " + className;
	span.textContent = text;
	td.appendChild(span);
}

function formatDate(time) {
	if (time) {
		return new Date(time).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
	} else {
		return "-"; // ประวัติเก่าก่อนแก้โค้ดจะไม่มีวันที่เก็บไว้
	}
}

// สร้างแถวตารางด้วย createElement ตามคำแนะนำของอาจารย์ วนจากท้ายมาหน้า ให้รายการล่าสุดอยู่บนสุด
function renderHistory() {
	var tbody = document.getElementById("historyBody");
	tbody.innerHTML = "";

	if (scanHistory.length == 0) {
		tbody.innerHTML = "<tr><td colspan='7' class='empty'>ยังไม่มีประวัติ ลองไปสแกนก่อนนะ</td></tr>";
		return;
	}

	for (var i = scanHistory.length - 1; i >= 0; i--) {
		var row = scanHistory[i];
		var tr = document.createElement("tr");
		addCell(tr, i + 1);
		addCell(tr, formatDate(row.date));
		addCell(tr, row.name);
		addCell(tr, row.school);
		addCell(tr, row.menu);
		addPillCell(tr, row.leftover, leftoverClass(row.leftover));
		addPillCell(tr, row.status, statusClass(row.status));
		tbody.appendChild(tr);
	}
}

// นับจำนวนแต่ละระดับกินเหลือ + รวมแคล ของแถวที่ส่งมา ใช้ร่วมกันทั้งหน้ารายบุคคลและหน้าสถิติรวม
function countLevels(rows) {
	var sum = { count: [0, 0, 0, 0], error: 0, waste: 0, saved: 0, hasWaste: false };
	for (var i = 0; i < rows.length; i++) {
		if (rows[i].status == "ไม่ใช่อาหาร") {
			sum.error = sum.error + 1;
		}
		for (var j = 0; j < leftoverLevels.length; j++) {
			if (rows[i].leftover == leftoverLevels[j]) {
				sum.count[j] = sum.count[j] + 1;
			}
		}
		// ข้ามแถวที่ไม่มีข้อมูลแคล (เช่นเมนูที่พิมพ์เอง หรือประวัติเก่าก่อนแก้โค้ด)
		if (rows[i].wastedKcal != null && rows[i].wastedKcal != undefined) {
			sum.waste = sum.waste + rows[i].wastedKcal;
			sum.saved = sum.saved + rows[i].savedKcal;
			sum.hasWaste = true;
		}
	}
	return sum;
}

// หาตำแหน่งที่มีค่ามากที่สุดด้วยมือ ไม่ใช้ Math.max(...array) ถ้าเป็น 0 หมดจะคืน -1
function findMaxIndex(arr) {
	var maxIndex = -1;
	var maxValue = 0;
	for (var i = 0; i < arr.length; i++) {
		if (arr[i] > maxValue) {
			maxValue = arr[i];
			maxIndex = i;
		}
	}
	return maxIndex;
}

function mostLevelText(count) {
	var m = findMaxIndex(count);
	if (m == -1) {
		return "-";
	}
	return leftoverLevels[m] + " (" + count[m] + " ครั้ง)";
}

function kcalText(sum) {
	if (sum.hasWaste == true) {
		return [sum.waste + " kcal", sum.saved + " kcal"];
	}
	return ["-", "-"];
}

// แสดงประวัติเฉพาะของนักเรียนคนเดียว ตามชื่อที่พิมพ์ในช่อง studentNameInput
function showStudentHistory() {
	var name = document.getElementById("studentNameInput").value.trim();
	var tbody = document.getElementById("studentHistoryBody");
	tbody.innerHTML = "";

	// วนหาด้วยมือว่าแถวไหนในประวัติทั้งหมดเป็นของคนนี้บ้าง ไม่ใช้ filter
	var rows = [];
	for (var i = 0; i < scanHistory.length; i++) {
		if (name != "" && scanHistory[i].name == name) {
			rows.push(scanHistory[i]);
		}
	}

	if (rows.length == 0) {
		var msg = "ยังไม่มีประวัติของคนนี้";
		if (name == "") {
			msg = "พิมพ์ชื่อก่อนนะ";
		}
		tbody.innerHTML = "<tr><td colspan='6' class='empty'>" + msg + "</td></tr>";
	}

	for (var k = rows.length - 1; k >= 0; k--) {
		var tr = document.createElement("tr");
		addCell(tr, k + 1);
		addCell(tr, formatDate(rows[k].date));
		addCell(tr, rows[k].school);
		addCell(tr, rows[k].menu);
		addPillCell(tr, rows[k].leftover, leftoverClass(rows[k].leftover));
		if (rows[k].wastedKcal != null && rows[k].wastedKcal != undefined) {
			addCell(tr, rows[k].wastedKcal + " kcal");
		} else {
			addCell(tr, "-");
		}
		tbody.appendChild(tr);
	}

	var sum = countLevels(rows);
	var kcal = kcalText(sum);
	document.getElementById("stuTotal").innerHTML = rows.length;
	document.getElementById("stuMostLevel").innerHTML = mostLevelText(sum.count);
	document.getElementById("stuWasteKcal").innerHTML = kcal[0];
	document.getElementById("stuSavedKcal").innerHTML = kcal[1];
}


// ==================== ส่วนรูปภาพ + กล้อง (อัญอัญ) ====================

// แสดงรูปในกล่อง preview (ใช้ได้ทั้งตอนอัปโหลดไฟล์และถ่ายจากกล้อง) แล้วคืนค่า element ของรูปกลับไปด้วย
function setPreview(src) {
	var box = document.getElementById("preview-box");
	var img = document.createElement("img");
	img.src = src;
	box.innerHTML = "";
	box.appendChild(img);
	box.classList.add("has-image");
	// รูปใหม่ = จานใหม่ ล้างชื่อเมนูที่พิมพ์ไว้รอบก่อนกับผลเก่าออก กันเอาชื่อเมนูเก่าไปใช้ผิดจาน
	document.getElementById("manualMenuName").value = "";
	document.getElementById("result-box").classList.remove("show");
	return img;
}

function allowDrop(ev) {
	ev.preventDefault();
}

function dropImage(ev) {
	ev.preventDefault();
	showImage(ev.dataTransfer.files[0]);
}

function selectImage(ev) {
	showImage(ev.target.files[0]);
	ev.target.value = ""; // ล้างค่า เผื่อเลือกไฟล์เดิมซ้ำอีกรอบ onchange จะได้ทำงาน
}

// อ่านไฟล์รูปด้วย FileReader แล้วนำไปแสดงผล โดยรอให้รูปโหลดเสร็จสมบูรณ์ก่อนเก็บไว้ใช้กับโมเดล
function showImage(file) {
	if (!file) {
		return;
	}
	lastSource = "upload";
	hasImage = false;
	currentImageEl = null;
	var reader = new FileReader();
	reader.onload = function (e) {
		var img = setPreview(e.target.result);
		img.onload = function () {
			currentImageEl = img;
			hasImage = true;
			updateScanButton();
		};
	};
	reader.readAsDataURL(file);
}

// เปิดกล้องด้วย getUserMedia ซึ่งต้องรันบน localhost หรือ https เท่านั้น มิฉะนั้นเบราว์เซอร์จะไม่อนุญาต
function openCamera() {
	if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
		showToast("เบราว์เซอร์นี้เปิดกล้องไม่ได้ ลองใช้ Chrome ดูนะ");
		return;
	}
	// facingMode: environment คือกล้องหลัง (ถ้ามี) เพื่อความสะดวกในการถ่ายภาพอาหาร
	navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
		.then(function (stream) {
			cameraStream = stream;
			document.getElementById("cameraVideo").srcObject = stream;
			document.getElementById("camera-area").classList.add("show");
		})
		.catch(function (err) {
			showToast("เปิดกล้องไม่ได้ ลองเช็คว่าอนุญาตให้เว็บใช้กล้องรึยัง (" + err.message + ")");
		});
}

// ถ่ายรูปโดยวาดภาพจาก video ลงบน canvas แล้วแปลงเป็นรูปภาพ
// ตัดเอาเฉพาะสี่เหลี่ยมจัตุรัสตรงกลาง เพราะโมเดลรับรูป 224x224 จะได้เห็นรูปแบบเดียวกับที่โมเดลเห็น
function capturePhoto() {
	var video = document.getElementById("cameraVideo");
	var canvas = document.getElementById("workCanvas");
	var size = Math.min(video.videoWidth, video.videoHeight);
	var x = (video.videoWidth - size) / 2;
	var y = (video.videoHeight - size) / 2;
	canvas.width = size;
	canvas.height = size;
	canvas.getContext("2d").drawImage(video, x, y, size, size, 0, 0, size, size);
	setPreview(canvas.toDataURL("image/png"));
	lastSource = "camera";
	hasImage = true;
	closeCamera();
	updateScanButton();
}

function closeCamera() {
	if (cameraStream) {
		var tracks = cameraStream.getTracks();
		for (var i = 0; i < tracks.length; i++) {
			tracks[i].stop();
		}
		cameraStream = null;
	}
	document.getElementById("camera-area").classList.remove("show");
}


// ==================== โมเดล AI จดจำอาหาร (โอม) ====================
// โหลดโมเดลที่ฝึกฝน (train) เองจาก Teachable Machine (Image Project) โดยใช้ไฟล์ที่ export ในรูปแบบ TensorFlow.js
// นำไฟล์ (model.json, weights.bin, metadata.json) มาวางไว้ในโฟลเดอร์ model/ ที่อยู่ในตำแหน่งเดียวกับไฟล์นี้
// ชื่อ class ที่ใช้ตอนฝึกโมเดลต้องตรงกับ name ใน menuList ด้านล่างนี้ทุกตัวอักษร มิฉะนั้นจะไม่สามารถค้นหาข้อมูลแคลอรี่และสารอาหารได้
// มี class พิเศษชื่อ "ไม่ใช่อาหาร" สำหรับตรวจจับรูปภาพที่ไม่ใช่อาหาร เช่น รูปคนหรือรูปสัตว์เลี้ยง
// kcal คือค่าพลังงานโดยประมาณต่ออาหาร 1 จาน/ถ้วย อ้างอิงจากตารางแคลอรี่อาหารไทยของ HDmall
// https://hdmall.co.th/blog/table-of-calories-in-food-types/ (สืบค้นจาก Google ก.ย. 2026)
// เป็นเพียงค่าประมาณการเท่านั้น ปริมาณจริงอาจแตกต่างกันไปตามร้านและส่วนผสมที่ใช้
// เมนูที่เพิ่มรอบ 2 เป็นค่าประมาณคร่าวๆ ต่อ 1 จาน/ถ้วย ถ้าจะเช็คละเอียดดูได้ที่ฐานข้อมูลของสถาบันโภชนาการ ม.มหิดล
// https://inmu.mahidol.ac.th/thaifcd/ (ในเว็บเค้าบอกเป็นต่อ 100 กรัม ต้องคูณเป็นต่อจานเอาเอง)

var menuList = [
	{ name: "ข้าวมันไก่", kcal: 596, nutrition: "คาร์บจากข้าว โปรตีนจากไก่ ไขมันจากน้ำมันไก่ (ผักน้อยไปหน่อย)" },
	{ name: "ผัดกะเพราหมูสับ", kcal: 580, nutrition: "คาร์บจากข้าว โปรตีนจากหมูสับ ไขมันจากน้ำมันผัด วิตามินจากใบกะเพรา" },
	{ name: "ต้มยำกุ้ง", kcal: 65, nutrition: "โปรตีนจากกุ้ง วิตามินจากสมุนไพร ไขมันน้อย แต่โซเดียมเยอะอยู่" },
	{ name: "ข้าวผัดกุนเชียง", kcal: 590, nutrition: "คาร์บจากข้าว โปรตีนและไขมันจากกุนเชียงกับไข่" },
	{ name: "ก๋วยเตี๋ยว", kcal: 250, nutrition: "คาร์บจากเส้น โปรตีนจากลูกชิ้นและหมู น้ำซุปอิ่มแต่ผักน้อย" },
	{ name: "ข้าวไข่เจียว", kcal: 445, nutrition: "คาร์บจากข้าว โปรตีนและไขมันจากไข่เจียว ผักน้อยเหมือนกัน" },
	{ name: "แกงเขียวหวาน", kcal: 240, nutrition: "โปรตีนจากเนื้อหรือไก่ ไขมันจากกะทิค่อนข้างเยอะ วิตามินจากผักในแกง" },
	{ name: "ผัดซีอิ๊ว", kcal: 679, nutrition: "คาร์บจากเส้นใหญ่ โปรตีนจากไข่กับหมู ผักคะน้าให้วิตามินนิดหน่อย" },
	{ name: "ข้าวหมูทอด", kcal: 416, nutrition: "คาร์บจากข้าว โปรตีนจากหมูทอด แต่ไขมันจากการทอดค่อนข้างเยอะ" },
	{ name: "ข้าวคลุกกะปิ", kcal: 410, nutrition: "คาร์บจากข้าว โปรตีนจากกุ้งแห้งและไข่ โซเดียมจากกะปิสูง" },

	// เมนูที่เพิ่มมาใหม่ตอนเทรนโมเดลรอบ 2 (ใช้รูปจาก dataset อาหารไทย 48 เมนูใน Kaggle)
	// พวกกับข้าว (แกง ผัด ยำ ทอด) คิด kcal เฉพาะกับข้าว 1 จาน/ถ้วย ไม่รวมข้าวสวยนะ
	{ name: "แกงเทโพ", kcal: 290, nutrition: "โปรตีนและไขมันจากหมูสามชั้น ไขมันจากกะทิเยอะ ได้วิตามินจากผักบุ้ง" },
	{ name: "แกงเลียง", kcal: 100, nutrition: "วิตามินกับใยอาหารจากผักหลายอย่าง โปรตีนจากกุ้ง ไขมันน้อยมาก" },
	{ name: "แกงจืดเต้าหู้หมูสับ", kcal: 90, nutrition: "โปรตีนจากเต้าหู้กับหมูสับ ไขมันน้อย ได้ผักนิดหน่อย" },
	{ name: "แกงจืดมะระยัดไส้", kcal: 125, nutrition: "โปรตีนจากหมูสับที่ยัดไส้ วิตามินและใยอาหารจากมะระ" },
	{ name: "แกงมัสมั่นไก่", kcal: 324, nutrition: "โปรตีนจากไก่ คาร์บจากมันฝรั่ง ไขมันจากกะทิกับถั่วลิสงเยอะมาก" },
	{ name: "แกงส้มกุ้ง", kcal: 130, nutrition: "โปรตีนจากกุ้ง วิตามินจากผัก ไขมันน้อย แต่โซเดียมสูง" },
	{ name: "ไก่ผัดเม็ดมะม่วงหิมพานต์", kcal: 300, nutrition: "โปรตีนจากไก่ ไขมันจากเม็ดมะม่วงกับน้ำมันผัด ผักนิดหน่อย" },
	{ name: "ไข่ดาว", kcal: 150, nutrition: "โปรตีนจากไข่ ไขมันจากน้ำมันที่ใช้ทอด" },
	{ name: "ไข่พะโล้", kcal: 400, nutrition: "โปรตีนจากไข่กับหมู ไขมันจากหมูสามชั้น น้ำตาลกับโซเดียมจากน้ำพะโล้" },
	{ name: "ไข่ลูกเขย", kcal: 250, nutrition: "โปรตีนจากไข่ ไขมันจากการทอด น้ำตาลจากซอสมะขามค่อนข้างเยอะ" },
	{ name: "กล้วยบวชชี", kcal: 230, nutrition: "คาร์บและโพแทสเซียมจากกล้วย ไขมันจากกะทิ น้ำตาลเยอะ (ของหวาน)" },
	{ name: "ก๋วยเตี๋ยวคั่วไก่", kcal: 435, nutrition: "คาร์บจากเส้นใหญ่ โปรตีนจากไก่กับไข่ ไขมันจากน้ำมันคั่ว" },
	{ name: "กะหล่ำปลีผัดน้ำปลา", kcal: 160, nutrition: "วิตามินกับใยอาหารจากกะหล่ำปลี ไขมันจากน้ำมันผัด โซเดียมจากน้ำปลา" },
	{ name: "กุ้งแม่น้ำเผา", kcal: 200, nutrition: "โปรตีนสูงจากกุ้ง ไขมันจากมันกุ้ง คอเลสเตอรอลค่อนข้างสูง" },
	{ name: "กุ้งอบวุ้นเส้น", kcal: 300, nutrition: "คาร์บจากวุ้นเส้น โปรตีนจากกุ้ง ไขมันจากหมูสามชั้นที่รองก้นหม้อ" },
	{ name: "ขนมครก", kcal: 250, nutrition: "คาร์บจากแป้งข้าวเจ้า ไขมันจากกะทิ น้ำตาลพอสมควร (ของหวาน)" },
	{ name: "ข้าวเหนียวมะม่วง", kcal: 470, nutrition: "คาร์บจากข้าวเหนียว วิตามินจากมะม่วง ไขมันกับน้ำตาลจากน้ำกะทิเยอะ" },
	{ name: "ข้าวขาหมู", kcal: 690, nutrition: "คาร์บจากข้าว โปรตีนจากขาหมู แต่ไขมันจากหนังหมูเยอะมาก" },
	{ name: "ข้าวซอย", kcal: 520, nutrition: "คาร์บจากเส้นบะหมี่ โปรตีนจากไก่ ไขมันจากน้ำแกงกะทิ" },
	{ name: "ข้าวผัด", kcal: 560, nutrition: "คาร์บจากข้าว โปรตีนจากหมูกับไข่ ไขมันจากน้ำมันผัด" },
	{ name: "ข้าวผัดกุ้ง", kcal: 560, nutrition: "คาร์บจากข้าว โปรตีนจากกุ้งกับไข่ ไขมันจากน้ำมันผัด" },
	{ name: "ข้าวหมกไก่", kcal: 534, nutrition: "คาร์บจากข้าว โปรตีนจากไก่ ไขมันจากเนยกับน้ำมัน" },
	{ name: "ต้มข่าไก่", kcal: 220, nutrition: "โปรตีนจากไก่ ไขมันจากกะทิ วิตามินจากข่าตะไคร้" },
	{ name: "ทอดมัน", kcal: 300, nutrition: "โปรตีนจากเนื้อปลา แต่ไขมันจากการทอดเยอะ" },
	{ name: "ปอเปี๊ยะทอด", kcal: 250, nutrition: "คาร์บจากแป้งกับวุ้นเส้น ไขมันจากการทอดเยอะ ผักนิดหน่อย" },
	{ name: "ผักบุ้งไฟแดง", kcal: 150, nutrition: "วิตามินกับใยอาหารจากผักบุ้ง ไขมันจากน้ำมันผัด โซเดียมจากเต้าเจี้ยว" },
	{ name: "ผัดไท", kcal: 545, nutrition: "คาร์บจากเส้นจันท์ โปรตีนจากกุ้ง ไข่ และเต้าหู้ น้ำตาลค่อนข้างเยอะ" },
	{ name: "ผัดฟักทองใส่ไข่", kcal: 200, nutrition: "วิตามินเอจากฟักทอง โปรตีนจากไข่ ไขมันจากน้ำมันผัด" },
	{ name: "ผัดมะเขือยาวหมูสับ", kcal: 250, nutrition: "ใยอาหารจากมะเขือยาว โปรตีนจากหมูสับ มะเขืออมน้ำมันเยอะ" },
	{ name: "ผัดหอยลาย", kcal: 220, nutrition: "โปรตีนกับธาตุเหล็กจากหอย ไขมันจากน้ำพริกเผาและน้ำมัน" },
	{ name: "ฝอยทอง", kcal: 150, nutrition: "โปรตีนกับไขมันจากไข่แดง แต่น้ำตาลสูงมาก (ของหวาน)" },
	{ name: "พะแนงไก่", kcal: 300, nutrition: "โปรตีนจากไก่ ไขมันจากกะทิข้นๆ เยอะ" },
	{ name: "ยำถั่วพู", kcal: 200, nutrition: "ใยอาหารกับวิตามินจากถั่วพู โปรตีนจากกุ้งกับไข่ ไขมันจากกะทินิดหน่อย" },
	{ name: "ยำวุ้นเส้น", kcal: 120, nutrition: "คาร์บจากวุ้นเส้น โปรตีนจากหมูสับกับกุ้ง ไขมันน้อย แต่โซเดียมสูง" },
	{ name: "ลาบหมู", kcal: 200, nutrition: "โปรตีนจากหมูสับ วิตามินจากผักสมุนไพร คาร์บจากข้าวคั่วนิดหน่อย" },
	{ name: "สังขยาฟักทอง", kcal: 220, nutrition: "วิตามินเอจากฟักทอง โปรตีนจากไข่ ไขมันจากกะทิ น้ำตาลเยอะ (ของหวาน)" },
	{ name: "สาคูไส้หมู", kcal: 200, nutrition: "คาร์บจากแป้งสาคู โปรตีนจากหมู น้ำตาลจากไส้หวานๆ" },
	{ name: "ส้มตำ", kcal: 70, nutrition: "วิตามินซีกับใยอาหารจากมะละกอ ไขมันน้อย แต่โซเดียมกับน้ำตาลสูง" },
	{ name: "หมูปิ้ง", kcal: 250, nutrition: "โปรตีนจากหมู ไขมันจากมันหมูกับกะทิที่หมัก น้ำตาลพอสมควร" },
	{ name: "หมูสะเต๊ะ", kcal: 400, nutrition: "โปรตีนจากหมู ไขมันจากน้ำจิ้มถั่วกับกะทิเยอะ" },
	{ name: "ห่อหมก", kcal: 200, nutrition: "โปรตีนจากปลา ไขมันจากกะทิ วิตามินจากใบยอกับกะหล่ำ" }
];

// ระดับปริมาณอาหารที่เหลือ ต้องตรงกับ class ของโมเดลตัวที่ 2 (model-leftover/) ทุกตัวอักษร โดย index 0 คือเหลือมากที่สุด และตัวสุดท้ายคือรับประทานหมดจาน
var leftoverLevels = ["กินเหลือเยอะมาก", "กินเหลือประมาณนึง", "กินเหลือน้อย", "กินไม่เหลือเลย"];

function findMenuByName(name) {
	for (var i = 0; i < menuList.length; i++) {
		if (menuList[i].name == name) {
			return menuList[i];
		}
	}
	return null;
}

// นำชื่อเมนูไปใส่ใน datalist ของช่อง "ชื่อเมนู" เพื่อความสะดวกในการพิมพ์
function populateMenuDatalist() {
	var list = document.getElementById("knownMenus");
	for (var i = 0; i < menuList.length; i++) {
		var opt = document.createElement("option");
		opt.value = menuList[i].name;
		list.appendChild(opt);
	}
}

// ----------------------------------------------------------------
// ตั้งแต่บรรทัดนี้ถึงส่วน predictFood/predictLeftover เป็นโค้ดที่ก๊อปแนวคิด
// มาจากหน้าเว็บ Teachable Machine ตอน export โมเดลเลยครับ (อาจารย์อย่าหักคะแนนนะครับ)
// กลุ่มเราแก้แค่ชื่อตัวแปรกับ URL โฟลเดอร์ model ให้ตรงกับของกลุ่มเราเฉยๆ
// ----------------------------------------------------------------
var URL_MODEL = "model/model.json";
var URL_METADATA = "model/metadata.json";
var tmModel = null;

var URL_MODEL2 = "model-leftover/model.json";
var URL_METADATA2 = "model-leftover/metadata.json";
var leftoverModel = null;

var NOT_FOOD_LABEL = "ไม่ใช่อาหาร";
var CONFIDENCE_THRESHOLD = 0.5; // ถ้าค่าความมั่นใจต่ำกว่านี้ ถือว่าโมเดลทายไม่ชัวร์ เลยตัดสินว่าไม่ใช่อาหารไปเลย
var UNSURE_GAP = 0.15; // ถ้าอันดับ 1 กับอันดับ 2 ห่างกันไม่ถึง 15% ถือว่าโมเดลลังเล จะโชว์ตัวเลือกให้กดเลือกเอง
var TODAY_BOOST = 1.3; // คูณความน่าจะเป็นของเมนูวันนี้เพิ่มนิดหน่อย เพราะส่วนใหญ่นักเรียนก็กินเมนูของโรงเรียนอยู่แล้ว
var SURE_FOOD = 70; // ความมั่นใจ (%) ที่ถือว่าเป็นอาหารแน่ๆ ไม่ต้องเช็คจานเปล่าแล้ว
var EMPTY_COLOR_RATIO = 0.88; // จานเปล่าต้องมีพิกเซลสีขาว/เทาเกิน 88%
var EMPTY_TEXTURE = 7; // และต้องเรียบ (ค่าความต่างกับพิกเซลข้างๆ เฉลี่ยน้อยกว่านี้)

// โมเดลกินเหลือชอบทายจานเปล่าสะอาดๆ ผิด (เพราะตอนเทรนไม่มีรูปแบบนี้) เลยเขียนตัวเช็คเองแบบง่ายๆ
// ย่อรูปเหลือ 100x100 แล้ววนดูทุกพิกเซลว่า "ไม่มีสี" กับ "เรียบ" มั้ย ถ้าใช่ทั้งคู่ก็น่าจะเป็นจานเปล่า
function looksLikeEmptyPlate(input) {
	if (!input) {
		return false;
	}
	var w = input.width;
	var h = input.height;
	if (input.naturalWidth) {
		w = input.naturalWidth;
		h = input.naturalHeight;
	}
	var size = Math.min(w, h) * 0.8;
	var canvas = document.createElement("canvas");
	canvas.width = 100;
	canvas.height = 100;
	var ctx = canvas.getContext("2d");
	ctx.drawImage(input, (w - size) / 2, (h - size) / 2, size, size, 0, 0, 100, 100);
	var px = ctx.getImageData(0, 0, 100, 100).data; // เรียงเป็น r,g,b,a ต่อกันไปเรื่อยๆ

	var grayCount = 0;
	var diffSum = 0;
	var diffCount = 0;
	for (var y = 0; y < 100; y++) {
		for (var x = 0; x < 100; x++) {
			var i = (y * 100 + x) * 4;
			var r = px[i];
			var g = px[i + 1];
			var b = px[i + 2];
			var colorful = Math.max(r, g, b) - Math.min(r, g, b);
			if (colorful < 30) {
				grayCount = grayCount + 1;
			}
			// เทียบความสว่างกับพิกเซลทางขวา ถ้าต่างกันเยอะแปลว่ามีลาย (อาหาร เม็ดข้าว)
			if (x < 99) {
				var light = (r + g + b) / 3;
				var lightRight = (px[i + 4] + px[i + 5] + px[i + 6]) / 3;
				diffSum = diffSum + Math.abs(light - lightRight);
				diffCount = diffCount + 1;
			}
		}
	}
	var grayRatio = grayCount / 10000;
	var texture = diffSum / diffCount;
	console.log("เช็คจานเปล่า: สีขาว/เทา " + Math.round(grayRatio * 100) + "%, ความเป็นลาย " + texture.toFixed(1));
	return grayRatio > EMPTY_COLOR_RATIO && texture < EMPTY_TEXTURE;
}

// โหลดโมเดลตอนเปิดหน้าเว็บ ใช้ .then() แบบเดียวกับตัวอย่างของ Teachable Machine เลย
function loadModels() {
	document.getElementById("scanStatus").innerHTML = "<span class='spinner'></span>กำลังโหลดโมเดล AI รอแป๊บนึง...";

	// โมเดลตัวที่ 1 ทำนายว่าเป็นเมนูอะไร
	var load1 = tmImage.load(URL_MODEL, URL_METADATA).then(function (model) {
		tmModel = model;
		return "";
	}).catch(function (err) {
		// หากเปิดไฟล์โดยตรง (file://) จะโหลดไม่สำเร็จเพราะติด CORS จำเป็นต้องรันผ่าน local server
		return "โหลดโมเดลไม่สำเร็จ ลองรันผ่าน local server ดูนะ (" + err.message + ") ยังพิมพ์ชื่อเมนูเองได้อยู่";
	});

	// โมเดลตัวที่ 2 ทำนายว่ากินเหลือเยอะแค่ไหน แยกไฟล์กันคนละโมเดล ไม่เกี่ยวกับตัวบน
	var load2 = tmImage.load(URL_MODEL2, URL_METADATA2).then(function (model) {
		leftoverModel = model;
	}).catch(function (err) {
		console.warn("โหลดโมเดลกินเหลือไม่สำเร็จ:", err.message);
	});

	// รอให้โหลดเสร็จทั้ง 2 ตัวก่อน ค่อยเปิดให้กดสแกนได้
	Promise.all([load1, load2]).then(function (msg) {
		modelsReady = true;
		document.getElementById("scanStatus").innerHTML = msg[0];
		updateScanButton();
	});
}

// รูปภาพที่จะส่งให้โมเดลประมวลผล ใช้ร่วมกันทั้งโมเดลเมนูและโมเดลปริมาณอาหารที่เหลือ
function getScanInput() {
	if (lastSource == "camera") {
		return document.getElementById("workCanvas");
	} else {
		return currentImageEl;
	}
}

// ทำรูปซูมเข้าตรงกลาง 85% (ตัดขอบโต๊ะ/พื้นหลังออก) วาดลง canvas ขนาด 224x224 เท่ากับที่โมเดลใช้
function makeZoomImage(input) {
	var w = input.width;
	var h = input.height;
	if (input.naturalWidth) {
		w = input.naturalWidth;
		h = input.naturalHeight;
	}
	var size = Math.min(w, h) * 0.85;
	var canvas = document.createElement("canvas");
	canvas.width = 224;
	canvas.height = 224;
	canvas.getContext("2d").drawImage(input, (w - size) / 2, (h - size) / 2, size, size, 0, 0, 224, 224);
	return canvas;
}

// ให้โมเดลทายรูปเดียวกัน 3 แบบ (รูปปกติ, กลับซ้ายขวา, ซูมเข้า) แล้วเอาความน่าจะเป็นมาเฉลี่ยกัน
// ช่วยให้ผลนิ่งขึ้น ไม่เปลี่ยนไปมาแค่เพราะถ่ายเอียงนิดเดียว (predict ของ Teachable Machine มีพารามิเตอร์ flipped ให้อยู่แล้ว)
function predictAverage(model, input) {
	var tries = [model.predict(input, false), model.predict(input, true), model.predict(makeZoomImage(input), false)];
	return Promise.all(tries).then(function (all) {
		var avg = [];
		for (var i = 0; i < all[0].length; i++) {
			var sum = 0;
			for (var j = 0; j < all.length; j++) {
				sum = sum + all[j][i].probability;
			}
			avg.push({ className: all[0][i].className, probability: sum / all.length });
		}
		return avg;
	});
}

// เรียงจากมากไปน้อยแบบ selection sort ที่เรียนมา เอาแค่ howMany อันดับแรก
function getTopList(prediction, howMany) {
	var top = [];
	var used = [];
	for (var n = 0; n < howMany && n < prediction.length; n++) {
		var best = -1;
		for (var i = 0; i < prediction.length; i++) {
			if (used[i] != true && (best == -1 || prediction[i].probability > prediction[best].probability)) {
				best = i;
			}
		}
		used[best] = true;
		top.push(prediction[best]);
	}
	return top;
}

// เพิ่มน้ำหนักให้เมนูวันนี้ แล้วหารผลรวมใหม่ให้รวมกันได้ 1 เหมือนเดิม
function boostTodayMenu(prediction, todayMenu) {
	var total = 0;
	for (var i = 0; i < prediction.length; i++) {
		if (prediction[i].className == todayMenu) {
			prediction[i].probability = prediction[i].probability * TODAY_BOOST;
		}
		total = total + prediction[i].probability;
	}
	for (var j = 0; j < prediction.length; j++) {
		prediction[j].probability = prediction[j].probability / total;
	}
	return prediction;
}

// โมเดลตัวที่ 1: ทายว่าเป็นเมนูอะไร คืนค่า { isFood, name, confidence, unsure, choices }
function predictFood(input, todayMenu) {
	if (!tmModel || !input) {
		return Promise.resolve({ isFood: false, confidence: null, unsure: false, choices: [] });
	}

	return predictAverage(tmModel, input).then(function (prediction) {
		prediction = boostTodayMenu(prediction, todayMenu);
		var top = getTopList(prediction, prediction.length);

		// เก็บ 3 เมนูที่ใกล้เคียงที่สุด (ไม่เอา "ไม่ใช่อาหาร") ไว้ให้ผู้ใช้กดเลือกตอนโมเดลไม่ชัวร์
		var choices = [];
		for (var i = 0; i < top.length && choices.length < 3; i++) {
			if (top[i].className != NOT_FOOD_LABEL) {
				choices.push(top[i].className);
			}
		}

		var result = {};
		result.name = top[0].className;
		result.confidence = Math.round(top[0].probability * 100);
		result.isFood = top[0].className != NOT_FOOD_LABEL && top[0].probability >= CONFIDENCE_THRESHOLD;
		result.unsure = top[0].probability - top[1].probability < UNSURE_GAP;
		result.choices = choices;
		return result;
	});
}

// โมเดลตัวที่ 2: ทายระดับกินเหลือ คืนค่า { label, wasteRatio } หรือ null ถ้าโมเดลยังไม่พร้อม
// wasteRatio คิดแบบถ่วงน้ำหนัก เช่น ทาย "เหลือน้อย" 60% "เหลือประมาณนึง" 40% ก็เอามาเฉลี่ยตามนั้น ไม่ใช่เอาแค่ตัวที่ชนะ
function predictLeftover(input) {
	if (!leftoverModel || !input) {
		return Promise.resolve(null);
	}

	return predictAverage(leftoverModel, input).then(function (prediction) {
		var ratio = 0;
		for (var i = 0; i < prediction.length; i++) {
			ratio = ratio + prediction[i].probability * levelPercent(prediction[i].className);
		}
		var label = getTopList(prediction, 1)[0].className;
		// ถ้าทายว่ากินหมดแล้ว ก็ให้เป็น 0 ไปเลย ไม่งั้นจะขึ้นว่ากินหมดแต่มีแคลทิ้ง ดูแปลกๆ
		if (label == leftoverLevels[leftoverLevels.length - 1]) {
			ratio = 0;
		}
		return { label: label, wasteRatio: ratio };
	});
}

// เปิด/ปิดปุ่มสแกน และบอกว่ายังขาดอะไรอยู่
function updateScanButton() {
	var missing = "";
	if (!getSelectedSchool()) {
		missing = "เลือกโรงเรียน";
	} else if (hasImage == false) {
		missing = "ใส่รูปอาหาร";
	} else if (modelsReady == false) {
		missing = "รอโมเดลโหลดเสร็จ";
	}
	document.getElementById("scan-btn").disabled = missing != "";
	if (missing != "") {
		document.getElementById("scanHint").innerHTML = "ยังกดไม่ได้: " + missing + "ก่อนนะ";
	} else {
		document.getElementById("scanHint").innerHTML = "พร้อมแล้ว กดได้เลย!";
	}
}

// เมื่อกดปุ่มเริ่มสแกน จะรอผลลัพธ์จากโมเดลจริง
function scanFood() {
	var school = getSelectedSchool();
	if (hasImage == false || !school) {
		showToast("เลือกโรงเรียนกับใส่รูปอาหารก่อนนะ");
		return;
	}

	var btn = document.getElementById("scan-btn");
	btn.disabled = true;
	document.getElementById("scanStatus").innerHTML = "<span class='spinner'></span>กำลังสแกน... รอแป๊บนึง";
	document.getElementById("result-box").classList.remove("show");

	showScanResult(school).then(function () {
		btn.disabled = false;
		document.getElementById("scanStatus").innerHTML = "";
		document.getElementById("result-box").scrollIntoView({ behavior: "smooth", block: "start" });
	});
}

// ส่งรูปให้โมเดลทั้ง 2 ตัวพร้อมกัน แล้วแยกไปจัดการทีละกรณี
function showScanResult(school) {
	var scan = {};
	scan.name = document.getElementById("scannerName").value.trim();
	if (scan.name == "") {
		scan.name = "ไม่ระบุชื่อ";
	}
	scan.schoolName = schoolLabel(school);
	scan.todayMenu = getMenuForDay(school, getTodayDayKey());

	var input = getScanInput();
	return Promise.all([predictFood(input, scan.todayMenu), predictLeftover(input)]).then(function (results) {
		var food = results[0];
		scan.left = results[1];
		var manualName = document.getElementById("manualMenuName").value.trim();

		// โมเดลมั่นใจมากว่าเป็นอาหาร ก็เชื่อโมเดลเลย (กันข้าวขาวในจานขาวโดนนับว่าจานเปล่า)
		var sureFood = food.isFood == true && food.confidence >= SURE_FOOD;
		var isEmpty = false;
		if (sureFood == false) {
			if (looksLikeEmptyPlate(input) == true) {
				isEmpty = true;
			}
			if (scan.left && scan.left.label == leftoverLevels[leftoverLevels.length - 1]) {
				isEmpty = true;
			}
		}
		if (isEmpty == true) {
			// จานเปล่า = กินไม่เหลือเลย ทิ้ง 0 kcal แน่นอน ไม่ต้องเชื่อโมเดลกินเหลือ (มันชอบทายจานเปล่าผิด)
			scan.left = { label: leftoverLevels[leftoverLevels.length - 1], wasteRatio: 0 };
		}

		if (manualName != "") {
			// ผู้ใช้พิมพ์ชื่อเมนูเอง (เช่น พกข้าวมาจากบ้าน หรือ AI ทายผิด) ใช้ชื่อนั้นเลย ไม่มีค่าความมั่นใจ
			handleFoodResult(scan, { name: manualName, confidence: null, unsure: false, choices: [] });
		} else if (isEmpty == true) {
			// จานเปล่าที่กินหมดแล้ว โมเดลตัวที่ 1 จะดูไม่ออกว่าเมนูอะไร
			handleEmptyPlate(scan);
		} else if (food.isFood == true) {
			handleFoodResult(scan, food);
		} else {
			handleNotFood(scan, food);
		}
	});
}

// กรณีเจอเมนูอาหาร (จาก AI หรือที่พิมพ์เอง)
function handleFoodResult(scan, food) {
	var menu = findMenuByName(food.name);
	var kcal = null;
	var nutrition = "ระบบยังไม่มีข้อมูลสารอาหารของเมนูนี้";
	if (menu) {
		kcal = menu.kcal;
		nutrition = menu.nutrition;
	}

	var leftLabel = "ไม่ทราบ";
	var leftText = "ไม่ทราบ (โมเดลกินเหลือยังไม่พร้อม)";
	var wastePair = { wasted: null, saved: null };
	if (scan.left) {
		leftLabel = scan.left.label;
		leftText = "<span class='pill " + leftoverClass(leftLabel) + "'>" + leftLabel + "</span>";
		wastePair = calcWasteKcal(kcal, scan.left.wasteRatio);
	}

	// เปรียบเทียบกับเมนูของวันนี้
	var matchText = "วันนี้เป็นวันหยุด ไม่มีเมนูให้เทียบ";
	var status = "วันหยุด";
	if (scan.todayMenu == food.name) {
		matchText = "<span class='status-ok'>ตรงกับเมนูวันนี้</span>";
		status = "ตรง";
	} else if (scan.todayMenu) {
		matchText = "<span class='status-warn'>ไม่ตรง</span> เมนูวันนี้ของ" + scan.schoolName + "คือ " + scan.todayMenu;
		status = "ไม่ตรง";
	}

	var kcalShow = "ไม่มีข้อมูล";
	if (kcal) {
		kcalShow = kcal + " kcal";
	}
	var wasteShow = "-";
	if (wastePair.wasted != null) {
		wasteShow = wastePair.wasted + " kcal (กินได้จริง " + wastePair.saved + " kcal)";
	}

	showResult(food.name, food.confidence, matchText, kcalShow, leftText, wasteShow, nutrition);
	if (food.unsure == true) {
		showChoices("AI ยังลังเลอยู่ ใช่เมนูไหนกดเลือกได้เลย:", food.choices);
	}
	addHistory({ name: scan.name, school: scan.schoolName, menu: food.name, leftover: leftLabel, status: status, date: Date.now(), wastedKcal: wastePair.wasted, savedKcal: wastePair.saved });
}

// กรณีจานเปล่า กินหมดเกลี้ยง
function handleEmptyPlate(scan) {
	showResult("กินหมดเกลี้ยงเลย เก่งมาก!", null, "-", "-",
		"<span class='pill status-ok'>" + scan.left.label + "</span>", "0 kcal (ไม่มีเศษอาหารเหลือทิ้งเลย)",
		"จานเปล่าแบบนี้ AI ดูไม่ออกว่ากินเมนูอะไรไป ถ้าอยากบันทึกชื่อเมนูกับแคลอรี่ด้วย กดเลือกเมนูข้างบน หรือพิมพ์ชื่อเมนูเองได้");
	showChoices("วันนี้กินเมนูไหนไป?", getChoiceForEmpty(scan.todayMenu));
	addHistory({ name: scan.name, school: scan.schoolName, menu: "-", leftover: scan.left.label, status: "กินหมดจาน", date: Date.now(), wastedKcal: null, savedKcal: null });
}

// จานเปล่าไม่มีอะไรให้ AI ทาย เลยเสนอเมนูวันนี้ให้กดได้เลย (ถ้าไม่ใช่วันหยุด)
function getChoiceForEmpty(todayMenu) {
	if (todayMenu) {
		return [todayMenu];
	}
	return [];
}

// กรณีที่ไม่ใช่อาหาร เช่น ถ่ายภาพติดใบหน้าคน หรือโมเดลมั่นใจต่ำเกินไป
function handleNotFood(scan, food) {
	showResult("สิ่งนี้ไม่น่าใช่อาหาร", null, "-", "-", "-", "-",
		"ระบบเดาว่ารูปนี้เป็นรูปคนหรือของอย่างอื่น ลองถ่ายให้เห็นจานชัดๆ แล้วสแกนใหม่นะ หรือถ้าเป็นอาหารจริง กดเลือกเมนูข้างบนได้เลย");
	document.getElementById("resMenu").className = "status-error";
	showChoices("หรือว่าเป็นเมนูพวกนี้?", food.choices);
	addHistory({ name: scan.name, school: scan.schoolName, menu: "-", leftover: "-", status: "ไม่ใช่อาหาร", date: Date.now(), wastedKcal: null, savedKcal: null });
}

// ใส่ข้อมูลลงการ์ดผลการสแกน ทุกกรณีใช้ฟังก์ชันนี้ตัวเดียว
function showResult(menu, confidence, match, kcal, left, waste, nutri) {
	document.getElementById("resMenu").textContent = menu;
	document.getElementById("resMenu").className = "";
	if (confidence != null) {
		document.getElementById("resConfBar").style.width = confidence + "%";
		document.getElementById("resConfText").innerHTML = "AI มั่นใจ " + confidence + "%";
		document.getElementById("resConf").style.display = "block";
	} else {
		document.getElementById("resConf").style.display = "none";
	}
	document.getElementById("resMatch").innerHTML = match;
	document.getElementById("resKcal").innerHTML = kcal;
	document.getElementById("resLeft").innerHTML = left;
	document.getElementById("resWaste").innerHTML = waste;
	document.getElementById("resNutri").innerHTML = nutri;
	document.getElementById("resChoices").innerHTML = "";
	document.getElementById("result-box").classList.add("show");
}

// สร้างปุ่มตัวเลือกเมนู กดแล้วจะไปที่ chooseMenu()
function showChoices(title, names) {
	var box = document.getElementById("resChoices");
	box.innerHTML = "";
	if (names.length == 0) {
		return;
	}
	var p = document.createElement("p");
	p.textContent = title;
	box.appendChild(p);
	for (var i = 0; i < names.length; i++) {
		var btn = document.createElement("button");
		btn.type = "button";
		btn.className = "chip";
		btn.textContent = names[i];
		btn.onclick = function () {
			chooseMenu(this.textContent);
		};
		box.appendChild(btn);
	}
}

// ผู้ใช้กดเลือกเมนูที่ถูกเอง ลบประวัติแถวล่าสุด (ที่ AI ทายไว้) แล้วสแกนใหม่ด้วยชื่อเมนูนี้
function chooseMenu(name) {
	document.getElementById("manualMenuName").value = name;
	scanHistory.pop();
	saveHistory();
	scanFood();
}

// เลื่อนหน้าจอไปโฟกัสที่ช่องพิมพ์ชื่อเมนู สำหรับกรณีที่ต้องการแก้ไขผลการทำนายของ AI
function focusManualMenu() {
	var input = document.getElementById("manualMenuName");
	input.scrollIntoView({ behavior: "smooth", block: "center" });
	input.focus();
}


// ==================== เมนูโรงเรียน (มัช) ====================
// เก็บข้อมูลใน localStorage แยกตามโรงเรียนและวัน โดยใช้ key รูปแบบ menu_school1_Mon (ช่อง input มี id เป็น menuMon)

var dayKeyList = ["Mon", "Tue", "Wed", "Thu", "Fri"];
var dayLabelTH = { Mon: "จันทร์", Tue: "อังคาร", Wed: "พุธ", Thu: "พฤหัส", Fri: "ศุกร์" };

// เมนูเริ่มต้น ใช้ในกรณีที่ยังไม่เคยมีการบันทึกข้อมูล
var defaultMenus = {
	school1: { Mon: "ข้าวมันไก่", Tue: "ผัดกะเพราหมูสับ", Wed: "ต้มยำกุ้ง", Thu: "ข้าวผัดกุนเชียง", Fri: "ก๋วยเตี๋ยว" },
	school2: { Mon: "ข้าวไข่เจียว", Tue: "แกงเขียวหวาน", Wed: "ผัดซีอิ๊ว", Thu: "ข้าวหมูทอด", Fri: "ข้าวคลุกกะปิ" }
};

function menuKey(schoolId, dayKey) {
	return "menu_" + schoolId + "_" + dayKey;
}

// ตรวจสอบว่าวันนี้ตรงกับวันใด หากเป็นวันเสาร์หรืออาทิตย์จะคืนค่า null (getDay: 0 = อาทิตย์, 6 = เสาร์)
function getTodayDayKey() {
	var dayNum = new Date().getDay();
	if (dayNum == 0 || dayNum == 6) {
		return null;
	}
	return dayKeyList[dayNum - 1];
}

function getMenuForDay(schoolId, dayKey) {
	if (!dayKey) {
		return null;
	}
	var saved = localStorage.getItem(menuKey(schoolId, dayKey));
	if (saved) {
		return saved;
	} else {
		return defaultMenus[schoolId][dayKey];
	}
}

function showMenuSchool(id) {
	currentMenuSchool = id;
	document.getElementById("menuSchoolTab1").classList.toggle("active", id == "school1");
	document.getElementById("menuSchoolTab2").classList.toggle("active", id == "school2");
	loadMenu();
}

function loadMenu() {
	for (var i = 0; i < dayKeyList.length; i++) {
		var day = dayKeyList[i];
		document.getElementById("menu" + day).value = getMenuForDay(currentMenuSchool, day);
	}
}

function saveMenu() {
	for (var i = 0; i < dayKeyList.length; i++) {
		var day = dayKeyList[i];
		localStorage.setItem(menuKey(currentMenuSchool, day), document.getElementById("menu" + day).value);
	}
	showToast("บันทึกเมนูของ" + schoolLabel(currentMenuSchool) + "แล้ว ✔");
	updateTodayPreview();
}

function clearMenu() {
	for (var i = 0; i < dayKeyList.length; i++) {
		localStorage.removeItem(menuKey(currentMenuSchool, dayKeyList[i]));
	}
	showToast("ล้างเมนูของ" + schoolLabel(currentMenuSchool) + "แล้ว (กลับไปใช้เมนูตั้งต้น)");
	loadMenu();
	updateTodayPreview();
}


// ==================== สถิติรวม (ใบบุญ) ====================
function updateStats() {
	var sum = countLevels(scanHistory);
	var kcal = kcalText(sum);

	document.getElementById("statTotal").innerHTML = scanHistory.length;
	document.getElementById("statAvg").innerHTML = mostLevelText(sum.count);
	document.getElementById("statFull").innerHTML = sum.count[leftoverLevels.length - 1];
	document.getElementById("statError").innerHTML = sum.error;
	document.getElementById("statWasteKcal").innerHTML = kcal[0];
	document.getElementById("statSavedKcal").innerHTML = kcal[1];

	drawLevelChart(sum.count);
}

// กราฟแท่งแนวนอน ทำจาก div ธรรมดา ความยาวแท่ง = เปอร์เซ็นต์ของจำนวนครั้งทั้งหมดที่รู้ระดับกินเหลือ
function drawLevelChart(count) {
	var chart = document.getElementById("level-chart");
	chart.innerHTML = "";

	var total = 0;
	for (var i = 0; i < count.length; i++) {
		total = total + count[i];
	}
	if (total == 0) {
		chart.innerHTML = "<p class='hint'>ยังไม่มีข้อมูลระดับกินเหลือ ลองไปสแกนก่อนนะ</p>";
		return;
	}

	for (var j = 0; j < leftoverLevels.length; j++) {
		var percent = Math.round(count[j] * 100 / total);

		var row = document.createElement("div");
		row.className = "bar-row";

		var label = document.createElement("span");
		label.className = "bar-name";
		label.textContent = leftoverLevels[j];
		row.appendChild(label);

		var track = document.createElement("div");
		track.className = "bar-track";
		var fill = document.createElement("div");
		fill.className = "bar-fill bar-" + j;
		fill.style.width = percent + "%";
		track.appendChild(fill);
		row.appendChild(track);

		var num = document.createElement("span");
		num.className = "bar-num";
		num.textContent = count[j] + " (" + percent + "%)";
		row.appendChild(num);

		chart.appendChild(row);
	}
}


// ==================== เริ่มทำงานตอนโหลดหน้า (อัญอัญ) ====================
window.onload = function () {
	loadHistory();
	renderHistory();
	populateNameDatalist();
	populateMenuDatalist();
	showMenuSchool("school1");
	initSchoolPicker();
	updateScanButton();
	loadModels();
};
