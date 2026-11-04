# Design upstream

`upstream/` is the untouched copy of the team's design artifact
(https://claude.ai/artifact/CzGA4CpmL5yc5VpoWUVFoy) that `public/` is built on.

When the design changes, merge only the designer's changes into our code (3-way merge), never copy files over:

```bash
# new design files in /tmp/new/
for f in app.js app.css; do
  git merge-file public/$f design/upstream/$f /tmp/new/$f   # ours, base, theirs
done
cp /tmp/new/{app.js,app.css,index.html,uzex-ds.css} design/upstream/   # new base for next time
```
