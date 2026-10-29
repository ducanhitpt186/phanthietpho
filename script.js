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

  /* ===== Điện thoại / Gmail =====
     Trình duyệt thường (Safari, Chrome): để thẻ <a> tự mở app gọi điện / email,
     nhanh và ổn định như mọi link khác (không can thiệp).
     Trình duyệt trong app (Zalo, Facebook, Messenger, TikTok...): các trình duyệt
     này hay chặn tel:/mailto:, nên hiện khung có số/email + nút Sao chép. */
  var ua=navigator.userAgent||'';
  var inApp=/FBAN|FBAV|FB_IAB|Instagram|Zalo|Line\/|musical_ly|BytedanceWebview|TikTok|Messenger|; wv\)/i.test(ua)
    || (/iPhone|iPad|iPod/.test(ua) && !/Safari/.test(ua));

  function showSheet(kind,txt,href){
    var dlg=d.getElementById('contactDlg');
    if(!dlg){
      dlg=d.createElement('dialog');
      dlg.id='contactDlg';
      d.body.appendChild(dlg);
    }
    var isTel=kind==='tel';
    var gmail='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(txt);
    dlg.innerHTML=
      '<p><b>'+(isTel?'Gọi điện thoại':'Gửi email')+'</b></p>'+
      '<p style="font-size:1.35rem;font-weight:800;margin:12px 0;user-select:all;-webkit-user-select:all;overflow-wrap:anywhere">'+txt+'</p>'+
      '<div style="display:grid;gap:10px">'+
        '<a class="pill green" href="'+href+'">'+(isTel?'Gọi ngay':'Soạn thư')+'</a>'+
        (isTel?'':'<a class="pill white" href="'+gmail+'" target="_blank" rel="noopener">Mở Gmail trên web</a>')+
        '<button class="pill white" id="cdCopy" type="button">Sao chép '+(isTel?'số điện thoại':'email')+'</button>'+
        '<p style="font-size:.82rem;margin:2px 0 0;color:#4f7396">Nếu bấm không mở được, hãy bấm nút ⋯ rồi chọn “Mở bằng trình duyệt” (Safari/Chrome).</p>'+
        '<button class="pill white" id="cdClose" type="button">Đóng</button>'+
      '</div>';
    dlg.querySelector('#cdCopy').addEventListener('click',function(){
      copyText(txt).then(function(){say('Đã sao chép: '+txt,2600)}).catch(function(){say('Hãy giữ ngón tay lên chữ để sao chép',3200)});
    });
    dlg.querySelector('#cdClose').addEventListener('click',function(){dlg.close?dlg.close():dlg.removeAttribute('open')});
    if(dlg.showModal){if(!dlg.open)dlg.showModal()}else dlg.setAttribute('open','');
  }

  if(inApp){
    d.querySelectorAll('a[data-kind]').forEach(function(a){
      a.addEventListener('click',function(e){
        e.preventDefault();
        showSheet(a.getAttribute('data-kind'),a.getAttribute('data-copy'),a.getAttribute('href'));
      });
    });
  }

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
