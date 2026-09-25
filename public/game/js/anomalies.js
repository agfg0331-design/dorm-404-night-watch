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
    "assets/cam-lobby-clock-mid-v4.webp", "assets/cam-lobby-clock-final-v4.webp", "assets/cam-lobby-wet-footprints-approved-v1.webp",
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
    { id: "lobby-clock", start: 181, jitter: 4, camera: "cam06", category: "物品移动", title: "大厅挂钟高速逆行并发生偏移", visual: "clock-reverse", frames: ["assets/cam-lobby-clock-mid-v4.webp", "assets/cam-lobby-clock-final-v4.webp"], duration: 18, grace: 12, severity: 8, lead: { offset: -3, sender: "值班系统", text: "CAM 06 时间基准出现偏差，请人工核对挂钟。", kind: "real" } },
    { id: "dorm-window", start: 201, jitter: 5, camera: "cam01", category: "门窗异常", title: "阳台玻璃受冲击后碎裂", visual: "window-break", frames: ["assets/cam-dorm-window-broken-v2.webp"], duration: 15, grace: 19, severity: 13, lead: { offset: -3, sender: "值班系统", text: "CAM 01 检测到瞬时高频撞击声。请核对门窗。", kind: "real" } },
    { id: "stairs-light", start: 220, jitter: 4, camera: "cam05", category: "灯光异常", title: "楼梯灯逐层向上熄灭", visual: "stairs-darkness", frames: ["assets/cam-stairs-blackout-1-approved-v1.webp", "assets/cam-stairs-blackout-2-approved-v1.webp", "assets/cam-stairs-blackout-3-approved-v1.webp"], duration: 17, grace: 9, severity: 9, lead: { offset: -3, sender: "401 刘同学", text: "楼梯灯是跟着脚步一层一层灭的。", kind: "real" } },
    { id: "duty-self", start: 239, jitter: 4, camera: "cam04", category: "人物异常", title: "值班员抬头注视摄像头", visual: "self-turn", duration: 22, grace: 13, severity: 15, lead: { offset: -3, sender: "值班系统", text: "CAM 04 坐姿识别异常。请确认值班员状态。", kind: "real" } },
    { id: "hall-door", start: 256, jitter: 4, camera: "cam02", category: "门窗异常", title: "不存在的404房门缓慢打开", visual: "door-open", frames: ["assets/cam-hall-door-mid-v4.webp", "assets/cam-hall-door-open-v4.webp"], duration: 21, grace: 8, severity: 13, lead: { offset: -3, sender: "未知号码", text: "404的门开了。里面不是宿舍。", kind: "real" } },
    { id: "laundry-reflection", start: 272, jitter: 3, camera: "cam03", category: "人物异常", title: "镜中出现未进入房间的人", visual: "mirror-reflection", duration: 18, grace: 7, severity: 14, lead: { offset: -3, sender: "值班系统", text: "CAM 02 检测到人员活动。", kind: "false" } },
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

  window.GameContent = { cameras, events, narrative, frameAssets };
})();
