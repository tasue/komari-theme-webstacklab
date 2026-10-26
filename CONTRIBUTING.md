# 参与贡献

请先阅读 README 中的开发和数据口径说明。修改源码后执行：

```sh
python build_assets.py
node --check dist/assets/bundle.js
node analytics.test.cjs
python package_theme.py
```

请把源文件和更新后的合并资源一起提交。涉及布局时检查桌面、手机、自动刷新及全局/单节点两种模式；不要提交真实 Token、站点登录信息或私人监控数据。

提交贡献表示你同意该贡献按仓库的 MIT 许可证分发。
