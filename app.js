// app.js - รวมโค้ด JavaScript ของกลุ่ม แบ่งหน้าที่รับผิดชอบเป็นส่วนๆ หากแก้ไขส่วนใดกรุณาระบุชื่อผู้แก้ไขไว้ในคอมเมนต์ด้วย
// ผู้รับผิดชอบแต่ละส่วน: อัญอัญ = CSS/ตกแต่งหน้าเว็บ, โอม = โมเดล AI จดจำอาหาร/อัปโหลดรูป/กล้อง, มัช = โรงเรียน/เมนู, ใบบุญ = ประวัติ/สถิติ

// ตัวแปรที่ใช้ร่วมกันเกือบทุกส่วน เก็บไว้ด้านบนสุดเลย จะได้หาง่าย
var scanHistory = [];
var lastSource = "none"; // "upload" หรือ "camera" หรือ "none"
var hasImage = false;
var cameraStream = null;
var currentImageEl = null; // เก็บ element รูปที่อัปโหลดไว้ เผื่อต้องส่งให้โมเดลตอนกดสแกน

var currentMenuSchool = "school1";


// ==================== ส่วนสลับหน้า (อัญอัญ) ====================
// เว็บนี้เป็นแบบหน้าเดียว (Single Page) มี section ทั้งหมด 5 ส่วน ใช้ class active ในการซ่อน/แสดงผล

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
	var text = "เลือกโรงเรียนก่อน เดี๋ยวจะบอกว่าวันนี้เมนูอะไร";
	if (school && !dayKey) {
		text = "วันนี้เป็นวันหยุด ไม่มีเมนูอาหารกลางวันให้เทียบนะ";
	}
	if (school && dayKey) {
		text = "วันนี้ (" + dayLabelTH[dayKey] + ") เมนูของ" + schoolLabel(school) + " คือ <b>" + getMenuForDay(school, dayKey) + "</b>";
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

function addHistory(row) {
	scanHistory.push(row);
	localStorage.setItem("scanHistory", JSON.stringify(scanHistory));
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

// แปลงระดับกินเหลือเป็นพลังงาน (กิโลแคลอรี่) ที่สูญเสียไปโดยประมาณ เทียบจากแคลของเมนูนั้น
// สัดส่วนตรงนี้กลุ่มเรากำหนดเองแบบคร่าวๆ (ไม่ได้อิงงานวิจัยไหน) แค่ประมาณว่ากินเหลือมากก็สูญเสียมากตามสัดส่วน
function calcWasteKcal(kcal, leftoverLabel) {
	if (kcal == null) {
		return { wasted: null, saved: null };
	}

	var percent = 0;
	if (leftoverLabel == "กินเหลือเยอะมาก") {
		percent = 0.9;
	} else if (leftoverLabel == "กินเหลือประมาณนึง") {
		percent = 0.6;
	} else if (leftoverLabel == "กินเหลือน้อย") {
		percent = 0.35;
	} else if (leftoverLabel == "กินไม่เหลือเลย") {
		percent = 0;
	} else {
		return { wasted: null, saved: null };
	}

	var wasted = Math.round(kcal * percent);
	var saved = kcal - wasted;
	return { wasted: wasted, saved: saved };
}

function clearHistory() {
	if (!confirm("จะล้างประวัติทั้งหมดจริงๆ ใช่มั้ย")) {
		return;
	}
	scanHistory = [];
	localStorage.removeItem("scanHistory");
	renderHistory();
}

// กำหนด class สีตามสถานะของรายการ เขียนแบบ if-else ยาวๆ ให้เห็นชัดๆ ว่าเช็คอะไรบ้าง
function statusClass(status) {
	if (status == "ตรง") {
		return "status-ok";
	} else if (status == "ไม่ตรง") {
		return "status-warn";
	} else if (status == "ไม่ใช่อาหาร") {
		return "status-error";
	} else {
		return "";
	}
}

// สร้างแถวตารางด้วย createElement ตามคำแนะนำของอาจารย์
function renderHistory() {
	var tbody = document.getElementById("historyBody");
	tbody.innerHTML = "";

	if (scanHistory.length == 0) {
		tbody.innerHTML = "<tr><td colspan='6'>ยังไม่มีประวัติ ลองไปสแกนก่อนนะ</td></tr>";
		return;
	}

	for (var i = 0; i < scanHistory.length; i++) {
		var row = scanHistory[i];
		var tr = document.createElement("tr");

		var tdNo = document.createElement("td");
		tdNo.innerHTML = i + 1;
		tr.appendChild(tdNo);

		var tdName = document.createElement("td");
		tdName.innerHTML = row.name;
		tr.appendChild(tdName);

		var tdSchool = document.createElement("td");
		tdSchool.innerHTML = row.school;
		tr.appendChild(tdSchool);

		var tdMenu = document.createElement("td");
		tdMenu.innerHTML = row.menu;
		tr.appendChild(tdMenu);

		var tdLeft = document.createElement("td");
		tdLeft.innerHTML = row.leftover;
		tr.appendChild(tdLeft);

		var tdStatus = document.createElement("td");
		tdStatus.innerHTML = row.status;
		tdStatus.className = statusClass(row.status); // กำหนดสีให้ช่องสุดท้ายซึ่งเป็นช่องสถานะ
		tr.appendChild(tdStatus);

		tbody.appendChild(tr);
	}
}

// แสดงประวัติเฉพาะของนักเรียนคนเดียว ตามชื่อที่พิมพ์ในช่อง studentNameInput
function showStudentHistory() {
	var name = document.getElementById("studentNameInput").value;
	name = name.trim();
	var tbody = document.getElementById("studentHistoryBody");
	tbody.innerHTML = "";

	if (name == "") {
		tbody.innerHTML = "<tr><td colspan='6'>พิมพ์ชื่อก่อนนะ</td></tr>";
		document.getElementById("stuTotal").innerHTML = "-";
		document.getElementById("stuMostLevel").innerHTML = "-";
		document.getElementById("stuWasteKcal").innerHTML = "-";
		document.getElementById("stuSavedKcal").innerHTML = "-";
		return;
	}

	// วนหาด้วยมือว่าแถวไหนในประวัติทั้งหมดเป็นของคนนี้บ้าง เก็บ index ไว้ก่อน ไม่ใช้ filter
	var rowIndex = [];
	for (var i = 0; i < scanHistory.length; i++) {
		if (scanHistory[i].name == name) {
			rowIndex.push(i);
		}
	}

	if (rowIndex.length == 0) {
		tbody.innerHTML = "<tr><td colspan='6'>ยังไม่มีประวัติของคนนี้</td></tr>";
		document.getElementById("stuTotal").innerHTML = "0";
		document.getElementById("stuMostLevel").innerHTML = "-";
		document.getElementById("stuWasteKcal").innerHTML = "-";
		document.getElementById("stuSavedKcal").innerHTML = "-";
		return;
	}

	// นับจำนวนแต่ละระดับกินเหลือด้วยมือ เหมือนที่ทำใน updateStats()
	var countLevel = [0, 0, 0, 0];
	var wasteSum = 0;
	var savedSum = 0;
	var hasWasteData = false;

	for (var k = 0; k < rowIndex.length; k++) {
		var row = scanHistory[rowIndex[k]];
		var tr = document.createElement("tr");

		var tdNo = document.createElement("td");
		tdNo.innerHTML = k + 1;
		tr.appendChild(tdNo);

		var tdDate = document.createElement("td");
		if (row.date) {
			tdDate.innerHTML = new Date(row.date).toLocaleString("th-TH");
		} else {
			tdDate.innerHTML = "-"; // ประวัติเก่าก่อนแก้โค้ดจะไม่มีวันที่เก็บไว้
		}
		tr.appendChild(tdDate);

		var tdSchool = document.createElement("td");
		tdSchool.innerHTML = row.school;
		tr.appendChild(tdSchool);

		var tdMenu = document.createElement("td");
		tdMenu.innerHTML = row.menu;
		tr.appendChild(tdMenu);

		var tdLeft = document.createElement("td");
		tdLeft.innerHTML = row.leftover;
		tr.appendChild(tdLeft);

		var tdWaste = document.createElement("td");
		if (row.wastedKcal != null && row.wastedKcal != undefined) {
			tdWaste.innerHTML = row.wastedKcal + " kcal";
			wasteSum = wasteSum + row.wastedKcal;
			savedSum = savedSum + row.savedKcal;
			hasWasteData = true;
		} else {
			tdWaste.innerHTML = "-";
		}
		tr.appendChild(tdWaste);

		tbody.appendChild(tr);

		for (var j = 0; j < leftoverLevels.length; j++) {
			if (row.leftover == leftoverLevels[j]) {
				countLevel[j] = countLevel[j] + 1;
			}
		}
	}

	// หาระดับที่เจอบ่อยสุดด้วยมือ ไม่ใช้ Math.max(...array)
	var mostCount = 0;
	var mostIndex = -1;
	for (var m = 0; m < countLevel.length; m++) {
		if (countLevel[m] > mostCount) {
			mostCount = countLevel[m];
			mostIndex = m;
		}
	}
	var mostText = "-";
	if (mostCount > 0) {
		mostText = leftoverLevels[mostIndex] + " (" + mostCount + " ครั้ง)";
	}

	document.getElementById("stuTotal").innerHTML = rowIndex.length;
	document.getElementById("stuMostLevel").innerHTML = mostText;
	if (hasWasteData == true) {
		document.getElementById("stuWasteKcal").innerHTML = wasteSum + " kcal";
		document.getElementById("stuSavedKcal").innerHTML = savedSum + " kcal";
	} else {
		document.getElementById("stuWasteKcal").innerHTML = "-";
		document.getElementById("stuSavedKcal").innerHTML = "-";
	}
}


// ==================== ส่วนรูปภาพ + กล้อง (อัญอัญ) ====================

// แสดงรูปในกล่อง preview (ใช้ได้ทั้งตอนอัปโหลดไฟล์และถ่ายจากกล้อง) แล้วคืนค่า element ของรูปกลับไปด้วย
function setPreview(src) {
	var box = document.getElementById("preview-box");
	var img = document.createElement("img");
	img.src = src;
	box.innerHTML = "";
	box.appendChild(img);
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
}

// อ่านไฟล์รูปด้วย FileReader แล้วนำไปแสดงผล โดยรอให้รูปโหลดเสร็จสมบูรณ์ก่อนเก็บไว้ใช้กับโมเดล
function showImage(file) {
	if (!file) {
		return;
	}
	lastSource = "upload";
	hasImage = true;
	currentImageEl = null;
	var reader = new FileReader();
	reader.onload = function (e) {
		var img = setPreview(e.target.result);
		img.onload = function () {
			currentImageEl = img;
		};
	};
	reader.readAsDataURL(file);
}

// เปิดกล้องด้วย getUserMedia ซึ่งต้องรันบน localhost หรือ https เท่านั้น มิฉะนั้นเบราว์เซอร์จะไม่อนุญาต
function openCamera() {
	if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
		alert("เบราว์เซอร์นี้เปิดกล้องไม่ได้ ลองใช้ Chrome ดูนะ");
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
			alert("เปิดกล้องไม่ได้ ลองเช็คว่าอนุญาตให้เว็บใช้กล้องรึยัง (" + err.message + ")");
		});
}

// ถ่ายรูปโดยวาดภาพจาก video ลงบน canvas แล้วแปลงเป็นรูปภาพ
function capturePhoto() {
	var video = document.getElementById("cameraVideo");
	var canvas = document.getElementById("workCanvas");
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;
	canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
	setPreview(canvas.toDataURL("image/png"));
	lastSource = "camera";
	hasImage = true;
	closeCamera();
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
	{ name: "ข้าวคลุกกะปิ", kcal: 410, nutrition: "คาร์บจากข้าว โปรตีนจากกุ้งแห้งและไข่ โซเดียมจากกะปิสูง" }
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

// โหลดโมเดลตอนเปิดหน้าเว็บ ใช้ .then() แบบเดียวกับตัวอย่างของ Teachable Machine เลย
function loadModels() {
	document.getElementById("scan-btn").disabled = true;
	document.getElementById("scanStatus").innerHTML = "<span class='spinner'></span>กำลังโหลดโมเดล AI รอแป๊บนึง...";

	// โมเดลตัวที่ 1 ทำนายว่าเป็นเมนูอะไร
	tmImage.load(URL_MODEL, URL_METADATA).then(function (model) {
		tmModel = model;
		document.getElementById("scanStatus").innerHTML = "";
		document.getElementById("scan-btn").disabled = false;
	}).catch(function (err) {
		// หากเปิดไฟล์โดยตรง (file://) จะโหลดไม่สำเร็จเพราะติด CORS จำเป็นต้องรันผ่าน local server
		document.getElementById("scanStatus").innerHTML = "โหลดโมเดลไม่สำเร็จ ลองรันผ่าน local server ดูนะ (" + err.message + ")";
		document.getElementById("scan-btn").disabled = false;
	});

	// โมเดลตัวที่ 2 ทำนายว่ากินเหลือเยอะแค่ไหน แยกไฟล์กันคนละโมเดล ไม่เกี่ยวกับตัวบน
	tmImage.load(URL_MODEL2, URL_METADATA2).then(function (model) {
		leftoverModel = model;
	}).catch(function (err) {
		// โมเดลนี้ไม่ใช่ส่วนที่จำเป็น หากโหลดไม่สำเร็จ ระบบจะสุ่มปริมาณอาหารที่เหลือแบบเดิมแทน
		console.warn("โหลดโมเดลกินเหลือไม่สำเร็จ จะสุ่มแทน:", err.message);
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

// นำรูปภาพไปให้โมเดลตัวที่ 1 ทำนาย วนหา class ที่ probability สูงสุดเองด้วย for loop
// (ก๊อปแนวทางมาจากตัวอย่างของ Teachable Machine แล้วปรับให้ใช้กับ menuList ของกลุ่มเรา)
function predictFood() {
	var input = getScanInput();
	if (!tmModel || !input) {
		return Promise.resolve({ isFood: false, confidence: null });
	}

	return tmModel.predict(input).then(function (prediction) {
		var maxProb = 0;
		var maxClass = "";
		for (var i = 0; i < prediction.length; i++) {
			if (prediction[i].probability > maxProb) {
				maxProb = prediction[i].probability;
				maxClass = prediction[i].className;
			}
		}
		var confidence = Math.round(maxProb * 100);

		if (maxClass == NOT_FOOD_LABEL || maxProb < CONFIDENCE_THRESHOLD) {
			return { isFood: false, confidence: confidence };
		}

		var found = findMenuByName(maxClass);
		var result = {};
		result.isFood = true;
		result.name = maxClass;
		result.confidence = confidence;
		if (found) {
			result.nutrition = found.nutrition;
			result.kcal = found.kcal;
		} else {
			result.nutrition = "ระบบยังไม่มีข้อมูลสารอาหารของเมนูนี้";
			result.kcal = null;
		}
		return result;
	});
}

// ทำนายระดับปริมาณอาหารที่เหลือจากรูปเดียวกัน คืนค่าชื่อ class ตรงๆ หรือ null ถ้าโมเดลยังไม่พร้อม
function predictLeftover() {
	var input = getScanInput();
	if (!leftoverModel || !input) {
		return Promise.resolve(null);
	}

	return leftoverModel.predict(input).then(function (prediction) {
		var maxProb = 0;
		var maxClass = "";
		for (var i = 0; i < prediction.length; i++) {
			if (prediction[i].probability > maxProb) {
				maxProb = prediction[i].probability;
				maxClass = prediction[i].className;
			}
		}
		return maxClass;
	});
}

// เมื่อกดปุ่มเริ่มสแกน จะรอผลลัพธ์จากโมเดลจริง (ไม่ใช่การหน่วงเวลาจำลองแบบเดิม)
function scanFood() {
	if (hasImage == false) {
		alert("เลือกรูป หรือเปิดกล้องถ่ายรูปอาหารก่อนนะ");
		return;
	}
	if (lastSource == "upload" && !currentImageEl) {
		alert("รอรูปโหลดเสร็จก่อนนะ แป๊บเดียว");
		return;
	}
	var school = getSelectedSchool();
	if (!school) {
		alert("เลือกโรงเรียนของคุณก่อนสแกน");
		return;
	}

	var btn = document.getElementById("scan-btn");
	btn.disabled = true;
	document.getElementById("scanStatus").innerHTML = "<span class='spinner'></span>กำลังสแกน... รอแป๊บนึง";
	document.getElementById("result-box").classList.remove("show");

	showScanResult(school).then(function () {
		btn.disabled = false;
		document.getElementById("scanStatus").innerHTML = "";
	});
}

function showScanResult(school) {
	var name = document.getElementById("scannerName").value;
	if (name == "") {
		name = "ไม่ระบุชื่อ";
	}
	var schoolName = schoolLabel(school);
	var dayKey = getTodayDayKey();

	return predictFood().then(function (result) {
		// กรณีที่ไม่ใช่อาหาร เช่น ถ่ายภาพติดใบหน้าคน หรือโมเดลมั่นใจต่ำเกินไป
		if (result.isFood == false) {
			var confText = "";
			if (result.confidence != null) {
				confText = " (มั่นใจ " + result.confidence + "%)";
			}
			document.getElementById("resMenu").innerHTML = "<span class='status-error'>เกิดข้อผิดพลาด: สิ่งนี้ไม่ใช่อาหาร</span>" + confText;
			document.getElementById("resMatch").innerHTML = "-";
			document.getElementById("resKcal").innerHTML = "-";
			document.getElementById("resLeft").innerHTML = "-";
			document.getElementById("resNutri").innerHTML = "ระบบเดาว่ารูปนี้เป็นรูปคนหรือของอย่างอื่น ลองสแกนรูปอาหารใหม่นะ หรือถ้ามั่นใจว่าเป็นอาหารจริง " +
				"<button type='button' class='link-btn' onclick='focusManualMenu()'>กดพิมพ์ชื่อเมนูเอง</button>";
			document.getElementById("resWaste").innerHTML = "-";
			document.getElementById("result-box").classList.add("show");

			addHistory({ name: name, school: schoolName, menu: "-", leftover: "-", status: "ไม่ใช่อาหาร", date: Date.now(), wastedKcal: null, savedKcal: null });
			return;
		}

		// หากผู้ใช้พิมพ์ชื่อเมนูเอง ให้ใช้ชื่อนั้นแทนผลที่ระบบทำนาย (สำหรับกรณีนำอาหารมาจากบ้าน)
		var manualName = document.getElementById("manualMenuName").value;
		manualName = manualName.trim();
		if (manualName != "") {
			var known = findMenuByName(manualName);
			result.name = manualName;
			if (known) {
				result.nutrition = known.nutrition;
				result.kcal = known.kcal;
			} else {
				result.nutrition = "ระบบยังไม่มีข้อมูลสารอาหารของเมนูนี้ (เป็นเมนูที่พิมพ์เอง)";
				result.kcal = null;
			}
			result.confidence = null; // เป็นชื่อที่พิมพ์เอง ไม่ใช่ผลจาก AI จึงไม่มีค่าร้อยละความมั่นใจ
		}

		var kcalText = "ไม่มีข้อมูล";
		if (result.kcal) {
			kcalText = result.kcal + " กิโลแคลอรี่ (โดยประมาณ)";
		}

		// ให้โมเดลตัวที่ 2 ทำนายระดับปริมาณอาหารที่เหลือจากรูปเดียวกัน หากยังไม่พร้อมใช้งานจะสุ่มค่าแทน
		return predictLeftover().then(function (lueo) {
			if (!lueo) {
				var randomIndex = Math.floor(Math.random() * leftoverLevels.length);
				lueo = leftoverLevels[randomIndex];
			}

			var lueoIndex = -1;
			for (var i = 0; i < leftoverLevels.length; i++) {
				if (leftoverLevels[i] == lueo) {
					lueoIndex = i;
				}
			}

			var leftText = lueo;
			if (lueoIndex == 0) {
				leftText = leftText + " <span class='status-warn'>กินให้หมดหน่อยนะ</span>";
			}
			if (lueoIndex == leftoverLevels.length - 1) {
				leftText = leftText + " <span class='status-ok'>เก่งมาก</span>";
			}

			// เปรียบเทียบกับเมนูของวันนี้
			var todayMenu = getMenuForDay(school, dayKey);
			var matchText = "วันนี้เป็นวันหยุด ไม่มีเมนูให้เทียบ";
			var status = "วันหยุด";
			if (todayMenu == result.name) {
				matchText = "<span class='status-ok'>ตรงกับเมนูวันนี้ (" + todayMenu + ")</span>";
				status = "ตรง";
			} else if (todayMenu) {
				matchText = "<span class='status-warn'>ไม่ตรงกับเมนูวันนี้</span> เมนูวันนี้ของ" + schoolName + "คือ " + todayMenu;
				status = "ไม่ตรง";
			}

			var confBadge = "";
			if (result.confidence != null) {
				confBadge = " <span style='color:#888;font-size:13px;'>(มั่นใจ " + result.confidence + "%)</span>";
			}
			var menuText = result.name + confBadge + " <button type='button' class='link-btn' onclick='focusManualMenu()'>ไม่ถูก? แก้เอง</button>";

			// ตรงนี้แปลงระดับกินเหลือเป็นพลังงานที่สูญเสียโดยประมาณ (ใบบุญ เพิ่มเข้ามาเพื่อเก็บสถิติ food waste)
			var wastePair = calcWasteKcal(result.kcal, lueo);
			var wasteText = "-";
			if (wastePair.wasted != null) {
				wasteText = wastePair.wasted + " กิโลแคลอรี่ (กินได้จริง " + wastePair.saved + " กิโลแคลอรี่)";
			}

			document.getElementById("resMenu").innerHTML = menuText;
			document.getElementById("resMatch").innerHTML = matchText;
			document.getElementById("resKcal").innerHTML = kcalText;
			document.getElementById("resLeft").innerHTML = leftText;
			document.getElementById("resWaste").innerHTML = wasteText;
			document.getElementById("resNutri").innerHTML = result.nutrition;
			document.getElementById("result-box").classList.add("show");

			addHistory({ name: name, school: schoolName, menu: result.name, leftover: lueo, status: status, date: Date.now(), wastedKcal: wastePair.wasted, savedKcal: wastePair.saved });
		});
	});
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
	var today = new Date();
	var dayNum = today.getDay();
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
	document.getElementById("menuSchoolLabel").innerHTML = "กำลังแก้ไขเมนูของ: " + schoolLabel(id);
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
	alert("บันทึกเมนูของ" + schoolLabel(currentMenuSchool) + "แล้ว");
	updateTodayPreview();
}

function clearMenu() {
	for (var i = 0; i < dayKeyList.length; i++) {
		var day = dayKeyList[i];
		localStorage.removeItem(menuKey(currentMenuSchool, day));
	}
	alert("ล้างเมนูของ" + schoolLabel(currentMenuSchool) + "แล้ว (จะกลับไปใช้เมนูตั้งต้น)");
	loadMenu();
	updateTodayPreview();
}


// ==================== สถิติรวม (ใบบุญ) ====================
function updateStats() {
	// นับจำนวนแต่ละระดับกินเหลือด้วยมือ ไม่ใช้ .filter เพราะยังไม่ได้เรียน
	var countLevel = [0, 0, 0, 0];
	var errorCount = 0;
	var wasteKcalSum = 0;
	var savedKcalSum = 0;

	for (var i = 0; i < scanHistory.length; i++) {
		if (scanHistory[i].status == "ไม่ใช่อาหาร") {
			errorCount = errorCount + 1;
		}
		for (var j = 0; j < leftoverLevels.length; j++) {
			if (scanHistory[i].leftover == leftoverLevels[j]) {
				countLevel[j] = countLevel[j] + 1;
			}
		}
		// รวมพลังงานที่สูญเสีย/กินได้จริงทั้งหมด ข้ามแถวที่ไม่มีข้อมูลแคล (เช่นเมนูที่พิมพ์เอง หรือประวัติเก่าก่อนแก้โค้ด)
		if (scanHistory[i].wastedKcal != null && scanHistory[i].wastedKcal != undefined) {
			wasteKcalSum = wasteKcalSum + scanHistory[i].wastedKcal;
			savedKcalSum = savedKcalSum + scanHistory[i].savedKcal;
		}
	}

	// หาค่ามากที่สุดด้วยมือ ไม่ใช้ Math.max(...array)
	var mostCount = 0;
	var mostIndex = -1;
	for (var k = 0; k < countLevel.length; k++) {
		if (countLevel[k] > mostCount) {
			mostCount = countLevel[k];
			mostIndex = k;
		}
	}

	var mostText = "-";
	if (mostCount > 0) {
		mostText = leftoverLevels[mostIndex] + " (" + mostCount + " ครั้ง)";
	}

	document.getElementById("statTotal").innerHTML = scanHistory.length;
	document.getElementById("statAvg").innerHTML = mostText;
	document.getElementById("statFull").innerHTML = countLevel[leftoverLevels.length - 1];
	document.getElementById("statError").innerHTML = errorCount;
	document.getElementById("statWasteKcal").innerHTML = wasteKcalSum + " kcal";
	document.getElementById("statSavedKcal").innerHTML = savedKcalSum + " kcal";
}


// ==================== เริ่มทำงานตอนโหลดหน้า (อัญอัญ) ====================
window.onload = function () {
	loadHistory();
	renderHistory();
	populateNameDatalist();
	showMenuSchool("school1");
	initSchoolPicker();
	populateMenuDatalist();
	loadModels();
};
