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
  var toast=d.getElementById('toast');
  function say(m){toast.textContent=m;toast.classList.add('show');setTimeout(function(){toast.classList.remove('show')},2200)}
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
