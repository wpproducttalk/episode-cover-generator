# WPPT episode cover compare lab

```powershell
cd company-docs\03-Marketing\asset-lab
npm run lab:wppt
```

Open http://127.0.0.1:4334/lab/wppt/

Lab chrome CSS is vendored at `vendor/css/` (copy of `wp-product-talk/brand/css`). After WPPT token changes, refresh:

```powershell
Copy-Item ..\..\..\08-Products\wp-product-talk\brand\css\* vendor\css\ -Recurse -Force
```

(Run from this folder.)
