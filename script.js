(function(){
  var d=document,root=d.documentElement;

  root.classList.add('js');
  var pageUrl=location.href.split('#')[0];

  /* ===== Lịch âm Việt Nam (thuật toán của Hồ Ngọc Đức, múi giờ +7) ===== */
  var LUNAR=(function(){
    var PI=Math.PI;
    function INT(x){return Math.floor(x)}
    function jdFromDate(dd,mm,yy){
      var a=INT((14-mm)/12),y=yy+4800-a,m=mm+12*a-3;
      var jd=dd+INT((153*m+2)/5)+365*y+INT(y/4)-INT(y/100)+INT(y/400)-32045;
      if(jd<2299161)jd=dd+INT((153*m+2)/5)+365*y+INT(y/4)-32083;
      return jd;
    }
    function newMoon(k,tz){
      var T=k/1236.85,T2=T*T,T3=T2*T,dr=PI/180;
      var Jd1=2415020.75933+29.53058868*k+0.0001178*T2-0.000000155*T3;
      Jd1+=0.00033*Math.sin((166.56+132.87*T-0.009173*T2)*dr);
      var M=359.2242+29.10535608*k-0.0000333*T2-0.00000347*T3;
      var Mpr=306.0253+385.81691806*k+0.0107306*T2+0.00001236*T3;
      var F=21.2964+390.67050646*k-0.0016528*T2-0.00000239*T3;
      var C1=(0.1734-0.000393*T)*Math.sin(M*dr)+0.0021*Math.sin(2*dr*M);
      C1=C1-0.4068*Math.sin(Mpr*dr)+0.0161*Math.sin(dr*2*Mpr);
      C1=C1-0.0004*Math.sin(dr*3*Mpr);
      C1=C1+0.0104*Math.sin(dr*2*F)-0.0051*Math.sin(dr*(M+Mpr));
      C1=C1-0.0074*Math.sin(dr*(M-Mpr))+0.0004*Math.sin(dr*(2*F+M));
      C1=C1-0.0004*Math.sin(dr*(2*F-M))-0.0006*Math.sin(dr*(2*F+Mpr));
      C1=C1+0.0010*Math.sin(dr*(2*F-Mpr))+0.0005*Math.sin(dr*(2*Mpr+M));
      var dt=T<-11?0.001+0.000839*T+0.0002261*T2-0.00000845*T3-0.000000081*T*T3:-0.000278+0.000265*T+0.000262*T2;
      return INT(Jd1+C1-dt+0.5+tz/24);
    }
    function sunLong(jdn,tz){
      var T=(jdn-2451545.5-tz/24)/36525,T2=T*T,dr=PI/180;
      var M=357.52910+35999.05030*T-0.0001559*T2-0.00000048*T*T2;
      var L0=280.46645+36000.76983*T+0.0003032*T2;
      var DL=(1.914600-0.004817*T-0.000014*T2)*Math.sin(dr*M);
      DL=DL+(0.019993-0.000101*T)*Math.sin(dr*2*M)+0.000290*Math.sin(dr*3*M);
      var L=(L0+DL)*dr;L=L-PI*2*INT(L/(PI*2));
      return INT(L/PI*6);
    }
    function month11(yy,tz){
      var k=INT((jdFromDate(31,12,yy)-2415021)/29.530588853);
      var nm=newMoon(k,tz);
      if(sunLong(nm,tz)>=9)nm=newMoon(k-1,tz);
      return nm;
    }
    function leapOffset(a11,tz){
      var k=INT((a11-2415021.076998695)/29.530588853+0.5),last,i=1,arc=sunLong(newMoon(k+i,tz),tz);
      do{last=arc;i++;arc=sunLong(newMoon(k+i,tz),tz)}while(arc!=last&&i<14);
      return i-1;
    }
    function convert(dd,mm,yy,tz){
      var dn=jdFromDate(dd,mm,yy),k=INT((dn-2415021.076998695)/29.530588853);
      var ms=newMoon(k+1,tz);if(ms>dn)ms=newMoon(k,tz);
      var a11=month11(yy,tz),b11=a11,ly;
      if(a11>=ms){ly=yy;a11=month11(yy-1,tz)}else{ly=yy+1;b11=month11(yy+1,tz)}
      var ld=dn-ms+1,diff=INT((ms-a11)/29),leap=0,lm=diff+11;
      if(b11-a11>365){var lo=leapOffset(a11,tz);if(diff>=lo){lm=diff+10;if(diff==lo)leap=1}}
      if(lm>12)lm-=12;
      if(lm>=11&&diff<4)ly-=1;
      return {day:ld,month:lm,year:ly,leap:leap,jd:dn};
    }
    var CAN=['Giáp','Ất','Bính','Đinh','Mậu','Kỷ','Canh','Tân','Nhâm','Quý'];
    var CHI=['Tý','Sửu','Dần','Mão','Thìn','Tỵ','Ngọ','Mùi','Thân','Dậu','Tuất','Hợi'];
    return {
      convert:function(d,m,y){return convert(d,m,y,7)},
      yearName:function(y){return CAN[(y+6)%10]+' '+CHI[(y+8)%12]},
      dayName:function(jd){return CAN[(jd+9)%10]+' '+CHI[(jd+1)%12]}
    };
  })();

  /* ===== Lời chào theo giờ + ngày dương/âm + hiệu ứng nền =====
     Xem thử từng buổi: thêm ?time=sang | trua | chieu | toi vào cuối địa chỉ trang */
  var THU=['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
  var PERIODS={
    sang:['buổi sáng','l-sunrise','#e67700','#8fd0fa'],
    trua:['buổi trưa','l-sun','#e03131','#8fd0fa'],
    chieu:['buổi chiều','l-wind','#d9480f','#f3c58f'],
    toi:['buổi tối','l-moon','#ffd54a','#0b1a3a']
  };
  var forced=(location.search.match(/[?&]time=(sang|trua|chieu|toi)\b/)||[])[1];
  function vnNow(){
    try{
      var p={};
      new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',hourCycle:'h23',weekday:'short'})
        .formatToParts(new Date()).forEach(function(x){p[x.type]=x.value});
      return {y:+p.year,m:+p.month,d:+p.day,h:(+p.hour)%24,wd:{Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[p.weekday]};
    }catch(e){
      var n=new Date();
      return {y:n.getFullYear(),m:n.getMonth()+1,d:n.getDate(),h:n.getHours(),wd:n.getDay()};
    }
  }
  function periodOf(h){return h>=5&&h<11?'sang':h>=11&&h<13?'trua':h>=13&&h<18?'chieu':'toi'}
  function rnd(a,b){return a+Math.random()*(b-a)}
  /* Hiệu ứng nền nhẹ máy: chỉ dùng CSS (transform/opacity), số phần tử ít */
  function buildFx(per){
    var fx=d.getElementById('fx');if(!fx)return;
    fx.innerHTML='';
    var i,e,s,frag=d.createDocumentFragment();
    function add(cls,css){e=d.createElement('i');e.className=cls;for(var k in css)e.style[k]=css[k];frag.appendChild(e);return e}
    if(per==='sang'||per==='trua'){
      // mây trôi chậm qua bầu trời
      for(i=0;i<5;i++){
        s=rnd(.6,1.25);
        add('cloud',{top:rnd(1,34)+'%',width:220*s+'px',height:90*s+'px',opacity:rnd(.6,.92).toFixed(2),
          animationDuration:rnd(70,130)+'s',animationDelay:-rnd(0,130)+'s'});
      }
    }else if(per==='chieu'){
      // gió thoảng + lá rơi nhẹ
      for(i=0;i<8;i++){
        s=rnd(.7,1.2);
        add('leaf'+(i%3===1?' g':i%3===2?' r':''),{width:16*s+'px',height:11*s+'px',left:rnd(0,100)+'%',
          animationDuration:rnd(13,22)+'s',animationDelay:-rnd(0,22)+'s'});
      }
      for(i=0;i<4;i++){
        add('wind',{top:rnd(8,75)+'%',animationDuration:rnd(5,9)+'s',animationDelay:-rnd(0,9)+'s'});
      }
    }else{
      // sao lấp lánh + sao băng thỉnh thoảng rơi
      for(i=0;i<36;i++){
        e=add('star',{left:rnd(0,100)+'%',top:rnd(0,62)+'%',animationDuration:rnd(2,6)+'s',animationDelay:-rnd(0,5)+'s'});
        if(Math.random()<.2){e.style.width='3px';e.style.height='3px'}
      }
      for(i=0;i<3;i++){
        add('meteor',{top:rnd(2,30)+'%',left:rnd(45,95)+'%',animationDuration:rnd(7,12)+'s',animationDelay:rnd(0,8)+'s'});
      }
    }
    fx.appendChild(frag);
  }
  var curPeriod='',curDay='';
  function updateToday(){
    var t=vnNow(),per=forced||periodOf(t.h),info=PERIODS[per];
    if(per!==curPeriod){
      curPeriod=per;
      root.classList.remove('t-sang','t-trua','t-chieu','t-toi');
      root.classList.add('t-'+per);
      root.style.setProperty('--accent',info[2]);
      d.getElementById('greetPart').textContent=info[0];
      d.getElementById('greetIc').firstElementChild.setAttribute('href','#'+info[1]);
      var tc=d.getElementById('themeColor');if(tc)tc.setAttribute('content',info[3]);
      buildFx(per);
    }
    var key=t.y+'-'+t.m+'-'+t.d;
    if(key!==curDay){
      curDay=key;
      d.getElementById('solarTxt').innerHTML='Hôm nay là <b>'+THU[t.wd]+'</b>, ngày '+t.d+' tháng '+t.m+' năm '+t.y;
      var L=LUNAR.convert(t.d,t.m,t.y);
      var dayTxt=(L.day<=10?'Mùng ':'Ngày ')+L.day;
      var tag=(L.month===1&&L.day<=3&&!L.leap)?'Tết Nguyên Đán':L.day===15?'Rằm':'';
      d.getElementById('lunarTxt').innerHTML='Âm lịch: <b>'+dayTxt+' tháng '+L.month+(L.leap?' nhuận':'')+'</b> năm '+LUNAR.yearName(L.year)+(tag?' <span class="lunar-tag">'+tag+'</span>':'');
    }
  }
  updateToday();
  setInterval(updateToday,60000);

  var btn=d.getElementById('whyBtn'),panel=d.getElementById('whyPanel'),lbl=d.getElementById('whyLbl');
  var lblText=lbl.textContent;
  btn.addEventListener('click',function(){
    var open=btn.getAttribute('aria-expanded')==='true';
    btn.setAttribute('aria-expanded',String(!open));
    panel.classList.toggle('open',!open);
    lbl.textContent=open?lblText:'Thu gọn';
    if(!open)setTimeout(function(){panel.scrollIntoView({behavior:'smooth',block:'start'})},200);
    setTimeout(prog,50);
  });

  /* ===== Bài viết: nút thu gọn cuối bài, mục lục, hiện dần, thanh tiến độ, ô tìm kiếm tự gõ ===== */
  function foldArticle(){
    btn.click();
    setTimeout(function(){btn.scrollIntoView({behavior:'smooth',block:'center'})},60);
  }
  var fold=d.getElementById('foldBtn'),fab=d.getElementById('fabFold');
  if(fold)fold.addEventListener('click',foldArticle);
  if(fab)fab.addEventListener('click',foldArticle);

  d.querySelectorAll('.toc a').forEach(function(a){
    a.addEventListener('click',function(e){
      var t=d.querySelector(a.getAttribute('href'));
      if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth',block:'start'})}
    });
  });

  var rvs=[].slice.call(d.querySelectorAll('.rv'));
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}});
    },{rootMargin:'0px 0px -8% 0px'});
    rvs.forEach(function(el){io.observe(el)});
  }else rvs.forEach(function(el){el.classList.add('in')});

  var bar=d.getElementById('readbar'),barI=bar&&bar.firstElementChild,art=panel.querySelector('.article');
  function prog(){
    if(!bar)return;
    var open=panel.classList.contains('open');
    bar.classList.toggle('on',open);
    if(!open){if(fab){fab.classList.remove('show');fab.tabIndex=-1}return}
    var r=art.getBoundingClientRect(),vh=window.innerHeight,h=r.height-vh;
    if(fab){var vis=r.top<vh*.35&&r.bottom>vh*.8;fab.classList.toggle('show',vis);fab.tabIndex=vis?0:-1}
    var p=h>0?Math.min(1,Math.max(0,-r.top/h)):1;
    barI.style.transform='scaleX('+p+')';
  }
  window.addEventListener('scroll',prog,{passive:true});
  window.addEventListener('resize',prog);

  var q=d.getElementById('typeQ');
  if(q){
    var qs=['resort Mũi Né sát biển','villa view biển Phan Thiết','nhà hàng hải sản Mũi Né','quán cà phê đẹp Phan Thiết'];
    var still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!still){
      var qi=0,ci=qs[0].length,del=true;
      setTimeout(function tick(){
        var w=qs[qi];
        if(del){ci--;if(ci<=0){ci=0;del=false;qi=(qi+1)%qs.length}}
        else{ci++;if(ci>=w.length){ci=w.length;del=true;q.textContent=w;return setTimeout(tick,1800)}}
        q.textContent=qs[qi].slice(0,ci);
        setTimeout(tick,del?35:90);
      },1800);
    }
  }

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

  /* ===== Tiện ích hay dùng (nội dung sửa trong trang /admin) ===== */
  var toolsBox=d.getElementById('tools'),toolsGrid=d.getElementById('toolsGrid'),toolDlg=d.getElementById('toolDlg');
  function safeUrl(u){return typeof u==='string'&&/^https?:\/\/\S+$/i.test(u.trim())?u.trim():''}
  function safePath(p){return typeof p==='string'&&/^uploads\/[\w.\-\/]+$/.test(p)&&p.indexOf('..')<0?p:''}
  function el(tag,cls,txt){var e=d.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
  function svgUse(id,w){
    var ns='http://www.w3.org/2000/svg',s=d.createElementNS(ns,'svg'),u=d.createElementNS(ns,'use');
    s.setAttribute('width',w);s.setAttribute('height',w);u.setAttribute('href','#'+id);s.appendChild(u);return s;
  }
  function iconNode(it){
    if(safePath(it.icon)){var im=el('img');im.src=it.icon;im.alt='';im.loading='lazy';return im}
    return d.createTextNode(it.name.trim().charAt(0).toUpperCase());
  }
  function closeDlg(x){x.close?x.close():x.removeAttribute('open')}
  function isDownload(it,u){
    return !!(it.download||/\/releases\/download\//i.test(u)||/\.(exe|msi|zip|rar|7z|apk|dmg|pdf|mp4|mp3|docx?|xlsx?|pptx?)(\?|#|$)/i.test(u));
  }
  /* Bấm icon → luôn mở bảng "Hướng dẫn sử dụng" đầy đủ, rồi mới Mở liên kết / Tải về */
  function openTool(it){
    var u=safeUrl(it.url),f=safePath(it.file),dl=u?isDownload(it,u):!!f;
    toolDlg.innerHTML='';
    var head=el('div','td-head'),ic=el('div','td-ic tool-ic'+(safePath(it.icon)?'':' letter'));
    ic.appendChild(iconNode(it));head.appendChild(ic);
    var ht=el('div','td-ttl');ht.appendChild(el('h3',null,it.name));
    ht.appendChild(el('span','td-kind',dl?'Tệp tải về':u?'Liên kết':'Thông tin'));
    head.appendChild(ht);toolDlg.appendChild(head);
    toolDlg.appendChild(el('p','td-lbl','Hướng dẫn sử dụng'));
    toolDlg.appendChild(el('div','td-note'+(it.note?'':' empty'),it.note||'Chưa có hướng dẫn cho tiện ích này.'));
    var btns=el('div','td-btns');
    if(u){
      var a=el('a','pill '+(dl?'green':'blue'));a.href=u;a.target='_blank';a.rel='noopener';
      a.appendChild(svgUse(dl?'l-download':'l-external',18));a.appendChild(d.createTextNode(dl?'Tải về':'Mở liên kết'));btns.appendChild(a);
    }
    if(f){
      var b=el('a','pill '+(u?'white':'green'));b.href=f;b.setAttribute('download',it.fileName||'');
      b.appendChild(svgUse('l-download',18));b.appendChild(d.createTextNode('Tải về'));btns.appendChild(b);
    }
    if((u&&dl)||f){
      if(inApp)btns.appendChild(el('p','td-hint','Nếu không tải được, hãy bấm nút ⋯ rồi chọn “Mở bằng trình duyệt”.'));
    }
    var c=el('button','pill white','Đóng');c.type='button';
    c.addEventListener('click',function(){closeDlg(toolDlg)});
    btns.appendChild(c);toolDlg.appendChild(btns);
    if(toolDlg.showModal){if(!toolDlg.open)toolDlg.showModal()}else toolDlg.setAttribute('open','');
    toolDlg.scrollTop=0;
  }
  if(toolDlg)toolDlg.addEventListener('click',function(e){if(e.target===toolDlg)closeDlg(toolDlg)});
  function renderTools(list){
    if(!Array.isArray(list))return;
    list=list.filter(function(it){return it&&typeof it.name==='string'&&it.name.trim()});
    if(!list.length||!toolsGrid)return;
    toolsGrid.innerHTML='';
    list.forEach(function(it){
      var u=safeUrl(it.url),f=safePath(it.file),box=el('div','tool');
      var a=el('button','tool-ic'+(safePath(it.icon)?'':' letter'));a.type='button';
      a.appendChild(iconNode(it));
      a.setAttribute('aria-label',it.name+' – xem hướng dẫn sử dụng');
      a.addEventListener('click',function(){openTool(it)});
      box.appendChild(a);
      if((u&&isDownload(it,u))||(!u&&f)){var bd=el('span','tool-badge');bd.appendChild(svgUse('l-download',11));box.appendChild(bd)}
      var nm=el('button','tool-name',it.name);nm.type='button';nm.addEventListener('click',function(){openTool(it)});
      box.appendChild(nm);
      toolsGrid.appendChild(box);
    });
    toolsBox.hidden=false;
  }
  if(toolsBox&&window.fetch){
    fetch('data/tienich.json?t='+Date.now(),{cache:'no-store'})
      .then(function(r){return r.ok?r.json():null}).then(renderTools).catch(function(){});
  }

  /* ===== Số tài khoản ngân hàng (nhập trong trang /admin) =====
     Link riêng để chia sẻ: <địa chỉ trang>#so-tk */
  var bankRow=d.getElementById('bankRow'),bankPub=d.getElementById('bankPub'),qrZoom=d.getElementById('qrZoom'),bankData=[];
  function digits(n){return String(n||'').replace(/\s+/g,'')}
  function groupNum(n){var x=digits(n);return /^\d+$/.test(x)?x.replace(/(\d{4})(?=\d)/g,'$1 '):x}
  function bankText(b){
    return 'Ngân hàng: '+b.bank+(b.owner?'\nChủ tài khoản: '+b.owner:'')+'\nSố tài khoản: '+digits(b.number);
  }
  function copyAnd(t,msg){copyText(t).then(function(){say(msg,2400)}).catch(function(){say('Hãy giữ ngón tay lên chữ để sao chép',3200)})}
  function openDlg(x){if(x.showModal){if(!x.open)x.showModal()}else x.setAttribute('open','')}
  function zoomQr(b){
    qrZoom.innerHTML='';
    qrZoom.appendChild(el('p','qz-ttl',b.bank));
    if(b.owner)qrZoom.appendChild(el('p','qz-sub',b.owner+' · '+groupNum(b.number)));
    var im=el('img','qz-img');im.src=b.qr;im.alt='Mã QR chuyển khoản '+b.bank;qrZoom.appendChild(im);
    qrZoom.appendChild(el('p','qz-hint','Mở app ngân hàng → Quét mã QR. Nếu đang xem trên chính điện thoại này, bấm “Lưu ảnh QR” rồi chọn ảnh từ thư viện trong app ngân hàng.'));
    var row=el('div','qz-btns');
    var dl=el('a','pill green');dl.href=b.qr;dl.setAttribute('download','QR-'+b.bank.replace(/[^\wÀ-ỹ]+/g,'-')+'.png');
    dl.appendChild(svgUse('l-download',18));dl.appendChild(d.createTextNode('Lưu ảnh QR'));row.appendChild(dl);
    var c=el('button','pill white','Đóng');c.type='button';c.addEventListener('click',function(){closeDlg(qrZoom)});row.appendChild(c);
    qrZoom.appendChild(row);openDlg(qrZoom);
  }
  function openBank(){
    if(!bankData.length)return;
    bankPub.innerHTML='';
    var head=el('div','bk-head');
    var ic=el('img','bk-logo');ic.src='assets/ic-bank.png';ic.alt='';head.appendChild(ic);
    var ht=el('div');var h=el('h3',null,'Số tài khoản');h.id='bankPubTtl';ht.appendChild(h);
    ht.appendChild(el('p','bk-sub','Thông tin chuyển khoản – bấm để sao chép'));head.appendChild(ht);
    bankPub.appendChild(head);
    bankData.forEach(function(b){
      var card=el('div','bk-card');
      card.appendChild(el('p','bk-name',b.bank));
      if(b.owner){var o=el('p','bk-line');o.appendChild(el('span',null,'Chủ tài khoản'));o.appendChild(el('b',null,b.owner));card.appendChild(o)}
      var nr=el('div','bk-num');
      var nb=el('div');nb.appendChild(el('span',null,'Số tài khoản'));nb.appendChild(el('b',null,groupNum(b.number)));nr.appendChild(nb);
      var cp=el('button','bk-copy');cp.type='button';cp.appendChild(svgUse('l-copy',16));cp.appendChild(d.createTextNode('Sao chép'));
      cp.addEventListener('click',function(){copyAnd(digits(b.number),'Đã sao chép số tài khoản: '+digits(b.number))});
      nr.appendChild(cp);card.appendChild(nr);
      if(b.qr){
        var q=el('button','bk-qr');q.type='button';q.setAttribute('aria-label','Phóng to mã QR '+b.bank+' để quét');
        var im=el('img');im.src=b.qr;im.alt='';im.loading='lazy';q.appendChild(im);
        q.appendChild(el('span',null,'Bấm vào mã để phóng to & quét'));
        q.addEventListener('click',function(){zoomQr(b)});card.appendChild(q);
      }
      var all=el('button','pill white bk-all');all.type='button';all.appendChild(svgUse('l-copy',16));all.appendChild(d.createTextNode('Sao chép toàn bộ thông tin'));
      all.addEventListener('click',function(){copyAnd(bankText(b),'Đã sao chép thông tin '+b.bank)});
      card.appendChild(all);
      bankPub.appendChild(card);
    });
    var btns=el('div','td-btns');
    var sh=el('button','pill green');sh.type='button';sh.appendChild(svgUse('i-share',18));sh.appendChild(d.createTextNode('Chia sẻ link số tài khoản'));
    sh.addEventListener('click',function(){
      var url=pageUrl+'#so-tk';
      if(navigator.share)navigator.share({title:'Số tài khoản – Phan Thiết Phố',text:bankData.map(bankText).join('\n\n'),url:url}).catch(function(){});
      else copyAnd(url,'Đã sao chép link số tài khoản');
    });
    btns.appendChild(sh);
    if(bankData.length>1){
      var ca=el('button','pill white');ca.type='button';ca.appendChild(svgUse('l-copy',16));ca.appendChild(d.createTextNode('Sao chép tất cả ngân hàng'));
      ca.addEventListener('click',function(){copyAnd(bankData.map(bankText).join('\n\n'),'Đã sao chép tất cả số tài khoản')});
      btns.appendChild(ca);
    }
    var c=el('button','pill white','Đóng');c.type='button';c.addEventListener('click',function(){closeDlg(bankPub)});btns.appendChild(c);
    bankPub.appendChild(btns);
    openDlg(bankPub);bankPub.scrollTop=0;
  }
  if(bankPub){
    bankPub.addEventListener('click',function(e){if(e.target===bankPub)closeDlg(bankPub)});
    qrZoom.addEventListener('click',function(e){if(e.target===qrZoom)closeDlg(qrZoom)});
    bankPub.addEventListener('close',function(){if(location.hash==='#so-tk'&&history.replaceState)history.replaceState(null,'',location.pathname+location.search)});
  }
  if(bankRow)bankRow.addEventListener('click',function(e){e.preventDefault();openBank()});
  if(bankRow&&window.fetch){
    fetch('data/bank.json?t='+Date.now(),{cache:'no-store'})
      .then(function(r){return r.ok?r.json():null})
      .then(function(list){
        if(!Array.isArray(list))return;
        bankData=list.filter(function(b){return b&&b.bank&&b.number}).map(function(b){
          return {bank:String(b.bank),owner:String(b.owner||''),number:String(b.number),qr:safePath(b.qr)};
        });
        if(!bankData.length)return;
        bankRow.hidden=false;
        d.getElementById('bankSub').textContent=bankData.length>1?bankData.length+' ngân hàng':bankData[0].bank;
        if(location.hash==='#so-tk')openBank();
      }).catch(function(){});
  }

  /* ===== Thêm vào màn hình chính (icon logo ngoài màn hình điện thoại) =====
     - Android/Chrome/Edge: dùng hộp thoại cài đặt chính thức của trình duyệt.
     - iPhone/iPad (Safari): iOS không cho web tự cài, nên hiện hướng dẫn 3 bước.
     - Trình duyệt trong app (Zalo, Facebook...): nhắc mở bằng Safari/Chrome trước. */
  var installBox=d.getElementById('installBtn'),installBtn=d.getElementById('installBtn'),
      idlg=d.getElementById('installDlg'),deferred=null;
  var isStandalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
  var isIOS=/iPhone|iPad|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  var isAndroid=/Android/i.test(ua);

  if(isStandalone&&installBox)installBox.hidden=true;

  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
    window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})});
  }

  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferred=e});
  window.addEventListener('appinstalled',function(){
    deferred=null;
    if(installBox)installBox.hidden=true;
    say('Đã thêm vào màn hình chính',2600);
  });

  function step(n,html){return '<li><i>'+n+'</i><span>'+html+'</span></li>'}

  function showInstallHelp(){
    var warn='',steps='';
    var shareIc='<svg class="inl" width="20" height="20"><use href="#i-ios-share"/></svg>';
    if(inApp){
      warn='<p class="warn">Bạn đang mở trong trình duyệt của ứng dụng (Zalo, Facebook…). Hãy mở bằng '+(isIOS?'Safari':'Chrome')+' để thêm được icon.</p>';
      steps=
        step(1,'Bấm nút <b>⋯</b> (hoặc <b>⋮</b>) ở góc màn hình')+
        step(2,'Chọn <b>Mở bằng trình duyệt</b> ('+(isIOS?'Safari':'Chrome')+')')+
        step(3,'Bấm lại nút <b>Thêm vào màn hình chính</b> trên trang');
    }else if(isIOS){
      steps=
        step(1,'Bấm nút <b>Chia sẻ</b> '+shareIc+' ở thanh dưới của Safari')+
        step(2,'Kéo xuống, chọn <b>Thêm vào Màn hình chính</b>')+
        step(3,'Bấm <b>Thêm</b> ở góc trên bên phải');
    }else if(isAndroid){
      steps=
        step(1,'Bấm nút <b>⋮</b> ở góc trên của Chrome')+
        step(2,'Chọn <b>Thêm vào Màn hình chính</b> (hoặc <b>Cài đặt ứng dụng</b>)')+
        step(3,'Bấm <b>Thêm</b> để xác nhận');
    }else{
      steps=
        step(1,'Bấm biểu tượng <b>Cài đặt</b> ở cuối thanh địa chỉ (Chrome/Edge)')+
        step(2,'Hoặc mở menu <b>⋮</b> rồi chọn <b>Cài đặt ứng dụng</b> / <b>Lưu và chia sẻ</b>')+
        step(3,'Bấm <b>Cài đặt</b> để xác nhận');
    }
    idlg.innerHTML=
      '<img class="dlg-ic" src="icons/icon-192.png" alt="" width="72" height="72">'+
      '<p id="installTtl"><b>Thêm vào màn hình chính</b></p>'+
      '<p class="sub">Icon logo Phan Thiết Phố sẽ nằm ngay trên màn hình điện thoại.</p>'+
      warn+'<ol class="steps">'+steps+'</ol>'+
      '<div style="display:grid;gap:10px">'+
        (inApp?'<button class="pill white" id="idCopy" type="button">Sao chép liên kết trang</button>':'')+
        '<button class="pill green" id="idClose" type="button">Đã hiểu</button>'+
      '</div>';
    var c=idlg.querySelector('#idCopy');
    if(c)c.addEventListener('click',function(){
      copyText(pageUrl).then(function(){say('Đã sao chép liên kết',2400)}).catch(function(){say(pageUrl,3200)});
    });
    idlg.querySelector('#idClose').addEventListener('click',function(){idlg.close?idlg.close():idlg.removeAttribute('open')});
    if(idlg.showModal){if(!idlg.open)idlg.showModal()}else idlg.setAttribute('open','');
  }

  if(installBtn)installBtn.addEventListener('click',function(){
    if(deferred&&!inApp){
      deferred.prompt();
      deferred.userChoice.then(function(r){
        if(r&&r.outcome==='accepted')say('Đang thêm vào màn hình chính…',2400);
        deferred=null;
      }).catch(function(){deferred=null});
    }else showInstallHelp();
  });

  d.getElementById('shareBtn').addEventListener('click',function(){
    var data={title:'Đức Anh Hoàng – Phan Thiết Phố',url:pageUrl};
    if(navigator.share){navigator.share(data).catch(function(){})}
    else if(navigator.clipboard){navigator.clipboard.writeText(data.url).then(function(){say('Đã sao chép liên kết')})}
    else say(data.url);
  });

  var dlg=d.getElementById('qrDlg'),made=false;
  d.getElementById('qrBtn').addEventListener('click',function(){
    if(!made&&window.QRCode){new QRCode(d.getElementById('qr'),{text:pageUrl,width:200,height:200});made=true}
    dlg.showModal();
  });
  d.getElementById('qrClose').addEventListener('click',function(){dlg.close()});
})();
