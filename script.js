(function(){
  var d=document,root=d.documentElement;

  var btn=d.getElementById('whyBtn'),panel=d.getElementById('whyPanel'),lbl=d.getElementById('whyLbl');
  btn.addEventListener('click',function(){
    var open=btn.getAttribute('aria-expanded')==='true';
    btn.setAttribute('aria-expanded',String(!open));
    panel.classList.toggle('open',!open);
    lbl.textContent=open?'Khám phá 5 lý do quan trọng':'Thu gọn nội dung';
    if(!open)setTimeout(function(){panel.scrollIntoView({behavior:'smooth',block:'start'})},200);
  });

  var toast=d.getElementById('toast'),toastTimer;
  function say(m,ms){
    toast.textContent=m;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){toast.classList.remove('show')},ms||2200);
  }

  function copyText(t){
    if(navigator.clipboard&&navigator.clipboard.writeText){
      return navigator.clipboard.writeText(t);
    }
    return new Promise(function(ok,fail){
      try{
        var ta=d.createElement('textarea');
        ta.value=t;ta.setAttribute('readonly','');
        ta.style.cssText='position:fixed;opacity:0;top:0;left:0';
        d.body.appendChild(ta);ta.select();
        var done=d.execCommand('copy');
        d.body.removeChild(ta);
        done?ok():fail();
      }catch(e){fail(e)}
    });
  }

  // Nút Điện thoại / Gmail: mở app, nếu không mở được thì sao chép
  d.querySelectorAll('a[data-kind]').forEach(function(a){
    a.addEventListener('click',function(e){
      e.preventDefault();
      var href=a.getAttribute('href'),txt=a.getAttribute('data-copy'),left=false;
      var kind=a.getAttribute('data-kind');
      function gone(){left=true}
      d.addEventListener('visibilitychange',gone,{once:true});
      window.addEventListener('pagehide',gone,{once:true});
      window.addEventListener('blur',gone,{once:true});
      window.location.href=href;
      setTimeout(function(){
        if(left)return;
        copyText(txt).then(function(){
          say((kind==='tel'?'Đã sao chép số điện thoại: ':'Đã sao chép email: ')+txt,3200);
        }).catch(function(){
          say((kind==='tel'?'Số điện thoại: ':'Email: ')+txt,5000);
        });
      },1500);
    });
  });

  d.getElementById('shareBtn').addEventListener('click',function(){
    var data={title:'Đức Anh Hoàng – Phan Thiết Phố',url:location.href};
    if(navigator.share){navigator.share(data).catch(function(){})}
    else if(navigator.clipboard){navigator.clipboard.writeText(data.url).then(function(){say('Đã sao chép liên kết')})}
    else say(data.url);
  });

  var dlg=d.getElementById('qrDlg'),made=false;
  d.getElementById('qrBtn').addEventListener('click',function(){
    if(!made&&window.QRCode){new QRCode(d.getElementById('qr'),{text:location.href,width:200,height:200});made=true}
    dlg.showModal();
  });
  d.getElementById('qrClose').addEventListener('click',function(){dlg.close()});
})();
