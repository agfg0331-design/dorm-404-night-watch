# TapTap H5 测试包

游戏源码只有 `public/game` 一份。Cloudflare Pages 继续从 `public/game` 部署 Web 版；以下命令只向被忽略的 `dist` 目录生成发行文件，不影响正式站目录。

```bash
npm run build:taptap:dev  # dist/taptap-dev，131500 可用
npm run build:taptap      # dist/taptap-release，131500 与 URL QA 加速关闭
```

将所需目录的**内容**作为 TapTap H5 静态资源测试包；入口是 `index.html`。所有图片、音频、脚本仍使用包内相对路径。公共留言板和交班留言使用现有 Cloudflare Pages `/api`，需要联网；个人档案与设置使用该容器的 localStorage，和浏览器档案分开。TapTap 开发包和正式包不要同时覆盖同一目录。

在普通浏览器本地启动 Web 源码时，可用 `?platform=taptap` 预览布局；这个覆盖仅在 localhost / 127.0.0.1 且 QA 已启用时生效，正式包不读取该参数。

## 真机验收（尚需 TapTap 容器）

- Android 与 iPhone 各检查横竖屏、刘海方向和从后台恢复后的布局；监控画面完整、六个 CAM 与手机入口可点击，全屏 overlay 使用整块屏幕。
- 首次点击、返回前台和系统音频中断后触摸屏幕，检查 BGM、异常音效、PA 和电话铃声。
- 在同一 TapTap 容器退出再进入，检查档案、设置、昵称、投票和已完成值班状态。
- 各跑普通、假天亮、不同场景的三局，走完 final blackout、自来电、TURN/STAY、结局、handoff 和重新开始。
- 分别从 Web 和 TapTap 发公共留言及交班留言，核对另一端可读取；写入时使用专门测试文字，随后由管理员清理。

以上项目依赖 TapTap 真机容器，自动测试与普通浏览器模拟不能替代。
