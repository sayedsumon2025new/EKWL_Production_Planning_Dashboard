// Test view of classic scripts: preserve existing semantic extraction tests after file splitting.
const fs=require('node:fs'),path=require('node:path');
function readDashboardHTML(){
  return fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(
    /<script\b[^>]*src="(dashboard-(?:main|effects)\.js)(?:\?[^\"]*)?"[^>]*><\/script>/g,
    (_,file)=>'<script>\n'+fs.readFileSync(path.join(__dirname,'..',file),'utf8')+'\n</script>');
}
module.exports={readDashboardHTML};
