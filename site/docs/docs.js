// Sorocarp docs: scroll spy, copy buttons, live "run it" calls, mobile contents.
(function () {
  var side = document.getElementById('side');
  var links = Array.prototype.slice.call(side.querySelectorAll('a[href^="#"]'));
  var byId = {};
  links.forEach(function (a) {
    byId[a.getAttribute('href').slice(1)] = a;
  });

  // ---- scroll spy
  var sections = Array.prototype.slice.call(document.querySelectorAll('.doc section[id]'));
  var current = null;
  function spy() {
    var y = window.scrollY + 130;
    var active = sections[0];
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop <= y) active = sections[i];
    }
    if (active && active.id !== current) {
      current = active.id;
      links.forEach(function (a) {
        a.classList.remove('on');
      });
      var a = byId[current];
      if (a) {
        a.classList.add('on');
        if (window.innerWidth > 980) {
          var top = a.offsetTop - side.clientHeight / 2;
          side.scrollTo({ top: top, behavior: 'smooth' });
        }
      }
    }
  }
  window.addEventListener('scroll', spy, { passive: true });
  spy();

  // ---- mobile contents
  var menu = document.getElementById('docs-menu');
  if (menu) {
    menu.addEventListener('click', function () {
      var open = side.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(open));
    });
    links.forEach(function (a) {
      a.addEventListener('click', function () {
        side.classList.remove('open');
      });
    });
  }

  // ---- copy buttons
  Array.prototype.forEach.call(document.querySelectorAll('.doc pre.code'), function (pre) {
    var btn = document.createElement('button');
    btn.className = 'copy';
    btn.type = 'button';
    btn.textContent = 'copy';
    btn.addEventListener('click', function () {
      var text = pre.querySelector('code').innerText;
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = 'copied';
        setTimeout(function () {
          btn.textContent = 'copy';
        }, 1400);
      });
    });
    pre.appendChild(btn);
  });

  // ---- run it: call the real endpoint and show what comes back
  Array.prototype.forEach.call(document.querySelectorAll('.try'), function (box) {
    var btn = box.querySelector('button');
    var out = box.querySelector('pre');
    var trim = Number(box.getAttribute('data-trim') || 0);
    btn.addEventListener('click', function () {
      btn.classList.add('busy');
      btn.textContent = 'Calling ' + box.getAttribute('data-url');
      var t0 = performance.now();
      fetch(box.getAttribute('data-url'), { cache: 'no-store' })
        .then(function (res) {
          return res.json().then(function (body) {
            return { status: res.status, body: body };
          });
        })
        .then(function (r) {
          if (trim && r.body && Array.isArray(r.body.tokens) && r.body.tokens.length > trim) {
            var more = r.body.tokens.length - trim;
            r.body.tokens = r.body.tokens.slice(0, trim);
            r.body['...'] = more + ' more tokens';
          }
          out.textContent = JSON.stringify(r.body, null, 2);
          box.classList.add('live');
          btn.textContent = 'Live response, ' + r.status + ', ' + Math.round(performance.now() - t0) + ' ms. Run again';
        })
        .catch(function () {
          out.textContent = '{ "error": "request failed" }';
          btn.textContent = 'Failed. Run again';
        })
        .then(function () {
          btn.classList.remove('busy');
        });
    });
  });
})();
