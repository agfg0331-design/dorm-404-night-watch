(function () {
  "use strict";

  const cameras = {
    cam01: { key: "1", code: "CAM 01", name: "404宿舍", location: "4F 东侧", ambient: "dorm", image: "assets/cam-dorm-normal.webp", corruptImage: "assets/cam-dorm-corrupt.webp" },
    cam02: { key: "2", code: "CAM 02", name: "四楼走廊", location: "4F 西侧", ambient: "hall", image: "assets/cam-hall-normal.webp", corruptImage: "assets/cam-hall-corrupt.webp" },
    cam03: { key: "3", code: "CAM 03", name: "公共洗衣房", location: "4F 北侧", ambient: "laundry", image: "assets/cam-laundry-normal.webp", corruptImage: "assets/cam-laundry-normal.webp" },
    cam04: { key: "4", code: "CAM 04", name: "值班室", location: "1F 值班室上方", ambient: "duty", image: "assets/cam-duty-overhead.webp", corruptImage: "assets/duty-room-corrupt.webp" },
    cam05: { key: "5", code: "CAM 05", name: "四楼楼梯间", location: "3F—4F", ambient: "stairs", image: "assets/cam-stairs-normal-v2.webp", corruptImage: "assets/cam-stairs-normal-v2.webp" },
    cam06: { key: "6", code: "CAM 06", name: "一楼大厅", location: "1F 入口", ambient: "lobby", image: "assets/cam-lobby-clean-v3.webp", corruptImage: "assets/cam-lobby-clean-v3.webp" }
  };

  const frameAssets = [
    "assets/cam-dorm-chair-fallen-v2.webp", "assets/cam-dorm-window-broken-v2.webp", "assets/cam-dorm-curtain-final-v3.webp",
    "assets/cam-hall-shadow-mid-v2.webp", "assets/cam-hall-shadow-near-v2.webp",
    "assets/cam-stairs-footprints-v3.webp", "assets/cam-lobby-door-open-v3.webp",
    "assets/cam-stairs-blackout-1-approved-v1.webp", "assets/cam-stairs-blackout-2-approved-v1.webp", "assets/cam-stairs-blackout-3-approved-v1.webp",
    "assets/cam-laundry-drip-mid-v4.webp", "assets/cam-laundry-drip-reverse-v4.webp",
    "assets/cam-laundry-machine-mid-v4.webp", "assets/cam-laundry-machine-violent-v4.webp",
    "assets/cam-laundry-mirror-shadow-1-approved-v1.webp", "assets/cam-laundry-mirror-shadow-2-approved-v1.webp", "assets/cam-laundry-mirror-shadow-3-approved-v1.webp",
    "assets/cam-lobby-clock-shake-1-approved-v1.webp", "assets/cam-lobby-clock-shake-2-approved-v1.webp", "assets/cam-lobby-clock-shake-3-approved-v1.webp", "assets/cam-lobby-wet-footprints-approved-v1.webp",
    "assets/cam-duty-shadow-stand-approved-v1.webp", "assets/cam-duty-shadow-right-fold-approved-v1.webp",
    "assets/cam-hall-door-mid-v4.webp", "assets/cam-hall-door-open-v4.webp", "assets/cam-lobby-normal-v2.webp",
    "assets/cam-duty-empty-v1.webp",
    "assets/turn-mid-v2.webp", "assets/turn-good-v2.webp", "assets/turn-bad-v2.webp"
  ];

  const events = [
    { id: "hall-light", start: 30, jitter: 3, camera: "cam02", category: "灯光异常", title: "走廊荧光灯无规律闪烁", visual: "light-flicker", duration: 14, grace: 8, severity: 6, lead: { offset: -4, sender: "403 林同学", text: "四楼灯管一直在闪，刚才还灭了两次。", kind: "real" } },
    { id: "laundry-drip", start: 48, jitter: 4, camera: "cam03", category: "未知异常", title: "水滴逆着墙面向上流动", visual: "pipe-drip", frames: ["assets/cam-laundry-drip-mid-v4.webp", "assets/cam-laundry-drip-reverse-v4.webp"], duration: 16, grace: 10, severity: 7, lead: { offset: -3, sender: "406 王同学", text: "洗衣房漏水了，声音好像从天花板上面传来的。", kind: "real" } },
    { id: "dorm-chair", start: 66, jitter: 5, camera: "cam01", category: "物品移动", title: "书桌椅突然翻倒并滑动", visual: "chair-fall", frames: ["assets/cam-dorm-chair-fallen-v2.webp"], duration: 13, grace: 18, severity: 10, lead: { offset: -4, sender: "404 匿名", text: "椅子在动。不是有人碰到，是它自己在动。", kind: "real" } },
    { id: "stair-steps", start: 84, jitter: 4, camera: "cam05", category: "人物异常", title: "楼梯脚印逐级向上出现", visual: "stair-steps", frames: ["assets/cam-stairs-footprints-v3.webp"], duration: 18, grace: 8, severity: 9, lead: { offset: -4, sender: "402 陈同学", text: "楼梯间一直有上楼声，可声音永远停在四楼下面。", kind: "real" } },
    { id: "lobby-door", start: 103, jitter: 5, camera: "cam06", category: "门窗异常", title: "大厅玻璃门自行开启", visual: "door-open", frames: ["assets/cam-lobby-door-open-v3.webp"], duration: 17, grace: 12, severity: 8, lead: { offset: -3, sender: "门卫老陈", text: "一楼门禁刚响了，没有刷卡记录。", kind: "real" } },
    { id: "laundry-machine", start: 122, jitter: 4, camera: "cam03", category: "物品移动", title: "故障洗衣机剧烈移位并甩出衣物", visual: "machine-start", frames: ["assets/cam-laundry-machine-mid-v4.webp", "assets/cam-laundry-machine-violent-v4.webp"], duration: 20, grace: 14, severity: 9, lead: { offset: -4, sender: "406 王同学", text: "那台贴着故障单的洗衣机又转起来了。", kind: "real" } },
    { id: "dorm-curtain", start: 141, jitter: 5, camera: "cam01", category: "人物异常", title: "空床帘后出现站立轮廓", visual: "bed-curtain", frames: ["assets/cam-dorm-curtain-final-v3.webp"], duration: 19, grace: 9, severity: 11, lead: { offset: -3, sender: "值班系统", text: "CAM 01 床位区域检测到持续遮挡。", kind: "real" } },
    { id: "hall-shadow", start: 160, jitter: 5, camera: "cam02", category: "人物异常", title: "走廊人影向镜头步行靠近", visual: "shadow-walk", frames: ["assets/cam-hall-normal.webp", "assets/cam-hall-shadow-mid-v2.webp", "assets/cam-hall-shadow-near-v2.webp"], duration: 24, grace: 7, severity: 14, lead: { offset: -4, sender: "405 张同学", text: "外面有人走路，但每一步都像从同一个位置传来。", kind: "real" } },
    { id: "lobby-clock", start: 181, jitter: 4, camera: "cam06", category: "物品移动", title: "大厅挂钟高速逆行并发生偏移", visual: "clock-reverse", frames: ["assets/cam-lobby-clock-shake-1-approved-v1.webp", "assets/cam-lobby-clock-shake-2-approved-v1.webp", "assets/cam-lobby-clock-shake-3-approved-v1.webp"], duration: 18, grace: 12, severity: 8, lead: { offset: -3, sender: "值班系统", text: "CAM 06 时间基准出现偏差，请人工核对挂钟。", kind: "real" } },
    { id: "dorm-window", start: 201, jitter: 5, camera: "cam01", category: "门窗异常", title: "阳台玻璃受冲击后碎裂", visual: "window-break", frames: ["assets/cam-dorm-window-broken-v2.webp"], duration: 15, grace: 19, severity: 13, lead: { offset: -3, sender: "值班系统", text: "CAM 01 检测到瞬时高频撞击声。请核对门窗。", kind: "real" } },
    { id: "stairs-light", start: 220, jitter: 4, camera: "cam05", category: "灯光异常", title: "楼梯灯逐层向上熄灭", visual: "stairs-darkness", frames: ["assets/cam-stairs-blackout-1-approved-v1.webp", "assets/cam-stairs-blackout-2-approved-v1.webp", "assets/cam-stairs-blackout-3-approved-v1.webp"], duration: 17, grace: 9, severity: 9, lead: { offset: -3, sender: "401 刘同学", text: "楼梯灯是跟着脚步一层一层灭的。", kind: "real" } },
    { id: "duty-self", start: 239, jitter: 4, camera: "cam04", category: "人物异常", title: "值班室黑影抬头、起身并向右横折", visual: "self-turn", frames: ["assets/cam-duty-shadow-stand-approved-v1.webp", "assets/cam-duty-shadow-right-fold-approved-v1.webp"], duration: 22, grace: 13, severity: 15, lead: { offset: -3, sender: "值班系统", text: "CAM 04 坐姿识别异常。请确认值班员状态。", kind: "real" } },
    { id: "hall-door", start: 256, jitter: 4, camera: "cam02", category: "门窗异常", title: "不存在的房门缓慢打开", visual: "door-open", frames: ["assets/cam-hall-door-mid-v4.webp", "assets/cam-hall-door-open-v4.webp"], duration: 21, grace: 8, severity: 13, lead: { offset: -3, sender: "未知号码", text: "走廊多出来的那扇门开了。里面不像宿舍。", kind: "real" } },
    { id: "laundry-reflection", start: 145, jitter: 2, camera: "cam03", category: "人物异常", title: "镜中出现未进入房间的人", visual: "mirror-reflection", frames: ["assets/cam-laundry-mirror-shadow-1-approved-v1.webp", "assets/cam-laundry-mirror-shadow-2-approved-v1.webp", "assets/cam-laundry-mirror-shadow-3-approved-v1.webp"], duration: 18, grace: 10, severity: 14, lead: { offset: -3, sender: "值班系统", text: "CAM 02 检测到人员活动。", kind: "false" } },
    { id: "lobby-footprints", start: 154, jitter: 3, camera: "cam06", category: "空间异常", title: "湿脚印从门外延伸至值班室", visual: "wet-footprints", frames: ["assets/cam-lobby-wet-footprints-approved-v1.webp"], duration: 20, grace: 8, severity: 14, lead: { offset: -3, sender: "门卫老陈", text: "刚拖完大厅，怎么又有一排湿脚印？", kind: "real" } },
    { id: "stair-loop", start: 302, jitter: 3, camera: "cam05", category: "空间异常", title: "上下楼梯连接到同一层", visual: "space-repeat", duration: 19, grace: 6, severity: 16, lead: { offset: -3, sender: "403 林同学", text: "我走了两层，墙上还是写着4F。", kind: "real" } },
    { id: "hall-shadow-near", start: 316, jitter: 2, camera: "cam02", category: "人物异常", title: "人影突然加速逼近镜头", visual: "shadow-rush", frames: ["assets/cam-hall-shadow-mid-v2.webp", "assets/cam-hall-shadow-near-v2.webp"], duration: 15, grace: 4, severity: 18, lead: { offset: -2, sender: "值班系统", text: "CAM 03 检测到人员活动。", kind: "false" } },
    { id: "duty-extra", start: 326, jitter: 2, camera: "cam04", category: "人物异常", title: "值班员身后出现第二个人", visual: "duty-extra", duration: 18, grace: 4, severity: 19, lead: { offset: -2, sender: "自己", text: "别看 CAM 04。", kind: "false" } },
    { id: "dorm-empty", start: 335, jitter: 1, camera: "cam01", category: "空间异常", title: "宿舍内部空间突然变空", visual: "space-repeat", duration: 12, grace: 3, severity: 17, lead: { offset: -2, sender: "404 匿名", text: "你看到的宿舍不是这一间。", kind: "false" } },
    { id: "lobby-double", start: 334, jitter: 0, camera: "cam06", category: "人物异常", title: "同一人同时站在门内与门外", visual: "lobby-double", duration: 8, grace: 2, severity: 20, lead: { offset: -2, sender: "值班系统", text: "CAM 06：访客人数 0。", kind: "false" } }
  ];

  const narrative = [
    { id: "welcome", at: 10, sender: "周老师", text: "今晚六路监控都在线。听到异响先看监控，再上报。" },
    { id: "quiet", at: 24, sender: "门卫老陈", text: "雨大，门口可能有小动物。别把所有声音都当异常。" },
    { id: "safe", at: 112, sender: "值班系统", text: "全楼信号正常。404 房间无人居住。" },
    { id: "wrong-floor", at: 190, sender: "405 张同学", text: "刚才群里的楼梯照片，好像不是我们这栋楼。", suspicious: true },
    { id: "cam03-off", at: 251, sender: "值班系统", text: "CAM 03 已离线，请勿查看。", corrupt: true },
    { id: "looked", at: 276, sender: "未知号码", text: "你为什么看了？", corrupt: true },
    { id: "contradiction", at: 308, sender: "周老师", text: "我今晚没有给你发过消息。", suspicious: true },
    { id: "no-operator", at: 329, sender: "值班系统", text: "CAM 04：FRAME 331-04 RECOVERED", corrupt: true },
    { id: "watching", at: 338, sender: "自己", text: "刚才那条消息不是我发的。", corrupt: true }
  ];

  // Camera slots stay put; a scene owns its own normal frame and anomaly pool.
  // This keeps the existing six-button monitor and the CAM 04 ending intact.
  const scenePool = {
    dorm: { ...cameras.cam01, id: "dorm", reportLocation: "404宿舍" },
    hall: { ...cameras.cam02, id: "hall", reportLocation: "四楼走廊" },
    laundry: { ...cameras.cam03, id: "laundry", reportLocation: "公共洗衣房" },
    stairs: { ...cameras.cam05, id: "stairs", reportLocation: "四楼楼梯间" },
    lobby: { ...cameras.cam06, id: "lobby", reportLocation: "一楼大厅" },
    music: { id: "music", name: "音乐教室", reportLocation: "音乐教室", location: "教学区", ambient: "dorm", image: "scene-preview/assets/music-normal.webp", corruptImage: "scene-preview/assets/music-normal.webp" },
    dance: { id: "dance", name: "舞蹈教室", reportLocation: "舞蹈教室", location: "教学区", ambient: "dorm", image: "scene-preview/assets/dance-normal.webp", corruptImage: "scene-preview/assets/dance-normal.webp" },
    elevator: { id: "elevator", name: "电梯厅", reportLocation: "电梯厅", location: "教学区", ambient: "hall", image: "scene-preview/assets/elevator-normal.webp", corruptImage: "scene-preview/assets/elevator-normal.webp" },
    lab: { id: "lab", name: "机房", reportLocation: "机房", location: "教学区", ambient: "duty", image: "scene-preview/assets/lab-normal.webp", corruptImage: "scene-preview/assets/lab-normal.webp" }
  };
  const originalSceneByCamera = { cam01: "dorm", cam02: "hall", cam03: "laundry", cam05: "stairs", cam06: "lobby", cam04: "duty" };
  const newSceneEvents = [
    { id: "music-piano", sceneId: "music", start: 38, jitter: 4, category: "物品移动", title: "琴盖自行掀开，琴凳离开原位", visual: "scene-still", frames: ["scene-preview/assets/music-open.webp"], duration: 17, grace: 10, severity: 7, lead: { sender: "值班系统", text: "音乐教室传来一声琴键响。", kind: "real" } },
    { id: "music-stands", sceneId: "music", start: 146, jitter: 4, category: "物品移动", title: "谱架集体转向并倒下一只", visual: "scene-still", frames: ["scene-preview/assets/music-stands.webp"], duration: 20, grace: 9, severity: 10, lead: { sender: "值班系统", text: "音乐教室传来金属落地声。", kind: "real" } },
    { id: "music-figure", sceneId: "music", start: 280, jitter: 3, category: "人物异常", title: "窗边人影出现，窗帘突然扬起", visual: "scene-still", frames: ["scene-preview/assets/music-figure.webp"], duration: 21, grace: 6, severity: 15, lead: { sender: "未知号码", text: "音乐教室的窗户开着吗？", kind: "real" } },
    { id: "dance-figure", sceneId: "dance", start: 64, jitter: 5, category: "人物异常", title: "白衣女人面对镜子，却没有倒影", visual: "scene-still", frames: ["scene-preview/assets/dance-figure.webp"], duration: 19, grace: 9, severity: 11, lead: { sender: "值班系统", text: "舞蹈教室检测到人员活动。", kind: "real" } },
    { id: "dance-desync", sceneId: "dance", start: 174, jitter: 4, category: "空间异常", title: "镜中出现与空教室不同步的动作", visual: "scene-still", frames: ["scene-preview/assets/dance-desync.webp"], duration: 20, grace: 8, severity: 13, lead: { sender: "未知号码", text: "舞蹈教室的镜子里刚才有人抬手。", kind: "real" } },
    { id: "dance-line", sceneId: "dance", start: 206, jitter: 3, category: "人物异常", title: "镜中排出一列无人对应的身影", visual: "scene-still", frames: ["scene-preview/assets/dance-line.webp"], duration: 18, grace: 10, severity: 14, lead: { sender: "值班系统", text: "舞蹈教室画面人数无法核实。", kind: "real" } },
    { id: "elevator-die", sceneId: "elevator", start: 49, jitter: 4, category: "空间异常", title: "两部电梯的楼层屏同时显示 DIE", visual: "scene-still", frames: ["scene-preview/assets/elevator-floor.webp"], duration: 17, grace: 8, severity: 9, lead: { sender: "值班系统", text: "电梯厅的楼层显示器同时失去读数。", kind: "real" } },
    { id: "elevator-open", sceneId: "elevator", start: 186, jitter: 4, category: "门窗异常", title: "电梯门自行打开，轿厢一片黑暗", visual: "scene-still", frames: ["scene-preview/assets/elevator-open.webp"], duration: 19, grace: 8, severity: 12, lead: { sender: "值班系统", text: "电梯厅的开门声响了，呼叫记录却是空的。", kind: "real" } },
    { id: "elevator-footprints", sceneId: "elevator", start: 312, jitter: 2, category: "人物异常", title: "湿脚印走向紧闭的电梯门", visual: "scene-still", frames: ["scene-preview/assets/elevator-footprints.webp"], duration: 16, grace: 5, severity: 16, lead: { sender: "未知号码", text: "电梯厅的地板又湿了。", kind: "real" } },
    { id: "lab-screen", sceneId: "lab", start: 80, jitter: 4, category: "灯光异常", title: "机房一台熄灭的电脑自行亮起", visual: "scene-still", frames: ["scene-preview/assets/lab-screen.webp"], duration: 17, grace: 8, severity: 9, lead: { sender: "值班系统", text: "机房有一台终端在无人操作时开机。", kind: "real" } },
    { id: "lab-feed", sceneId: "lab", start: 203, jitter: 4, category: "空间异常", title: "电脑屏幕同时显示值班室监控", visual: "scene-still", frames: ["scene-preview/assets/lab-feed.webp"], duration: 20, grace: 7, severity: 14, lead: { sender: "未知号码", text: "机房的电脑好像能看到值班室。", kind: "real" } },
    { id: "lab-static", sceneId: "lab", start: 321, jitter: 2, category: "监控异常", title: "机房多台屏幕同时出现雪花", visual: "scene-still", frames: ["scene-preview/assets/lab-static.webp"], duration: 15, grace: 5, severity: 17, lead: { sender: "值班系统", text: "机房多台终端信号同时中断。", kind: "real" } }
  ];
  const originalEvents = events.map((event) => ({ ...event, sceneId: originalSceneByCamera[event.camera] }));
  const allEvents = [...originalEvents, ...newSceneEvents];
  Object.values(scenePool).forEach((scene) => {
    scene.anomalies = allEvents.filter((event) => event.sceneId === scene.id);
  });

  function createShift(seed, forcedScenes) {
    let value = (Number(seed) || 0) >>> 0;
    // Mix nearby QA seeds before the shuffle so every scene remains reachable.
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = (value ^ (value >>> 16)) >>> 0;
    const random = () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
    const pool = Object.keys(scenePool);
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [pool[index], pool[other]] = [pool[other], pool[index]];
    }
    const selected = forcedScenes ? [...forcedScenes] : pool.slice(0, 5);
    if (selected.length !== 5 || new Set(selected).size !== 5 || selected.some((id) => !scenePool[id])) {
      throw new Error("每局必须选出五个不重复的有效监控场景");
    }
    const slots = ["cam01", "cam02", "cam03", "cam05", "cam06"];
    const shiftCameras = { cam04: { ...cameras.cam04, sceneId: "duty" } };
    selected.forEach((sceneId, index) => {
      const slot = slots[index];
      shiftCameras[slot] = { ...scenePool[sceneId], sceneId, code: `CAM ${slot.slice(-2)}`, key: slot.at(-1) };
    });
    const slotByScene = Object.fromEntries(selected.map((sceneId, index) => [sceneId, slots[index]]));
    const shiftEvents = allEvents.filter((event) => event.sceneId === "duty" || slotByScene[event.sceneId]).map((event) => {
      const camera = event.sceneId === "duty" ? "cam04" : slotByScene[event.sceneId];
      const code = shiftCameras[camera].code;
      const lead = { ...event.lead, text: event.lead.text.replace(/CAM 0[1-6]/g, (oldCode) => {
        const oldScene = originalSceneByCamera[`cam${oldCode.slice(-2)}`];
        const target = slotByScene[oldScene];
        if (target) return shiftCameras[target].code;
        // False leads still reference a feed that exists this run.
        return shiftCameras[slots.find((slot) => slot !== camera)].code;
      }) };
      return { ...event, camera, lead, reportLocation: shiftCameras[camera].reportLocation || shiftCameras[camera].name, code };
    });
    // Spread the selected scenes across the shift. Their original order and
    // late-night escalation survive, while the first event starts sooner and
    // the final hour leaves room to use the phone between reports.
    shiftEvents.sort((a, b) => a.start - b.start);
    shiftEvents.forEach((event, index) => {
      const evenStart = 12 + index * 314 / Math.max(1, shiftEvents.length - 1);
      event.start = Math.round(event.start * 0.1 + evenStart * 0.9);
      if (event.id === "duty-self") { event.duration = 14; event.grace = 16; }
      if (event.start >= 280) event.grace = Math.max(event.grace, 10);
    });
    const shiftNarrative = narrative.map((item) => {
      if (item.id === "safe" && !slotByScene.dorm) return { ...item, text: "全楼信号正常。值班室门禁没有访客记录。" };
      if (item.id === "wrong-floor" && !slotByScene.stairs) return { ...item, text: "刚才群里的照片，好像不是我们这栋楼。" };
      return item;
    });
    return { seed: Number(seed) || 0, sceneIds: selected, cameras: shiftCameras, events: shiftEvents, narrative: shiftNarrative };
  }

  window.GameContent = { cameras, events, narrative, frameAssets, scenePool, createShift };
})();
