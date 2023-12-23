concurrently -n tsc,rollup -c blue,green --kill-others ^
    "tsc -w" ^
    "rollup -w -c rollup.config.yaaekl.js"
