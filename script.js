// Reid — رِيْد

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;

// Analytics helper: no-ops until Plausible (or similar) is enabled
function track(name) {
  if (window.plausible) window.plausible(name);
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-track]');
  if (el) track(el.dataset.track);
});

// Robust WhatsApp / external deep links: open in a new tab when allowed,
// fall back to same-tab navigation if the popup/new-tab is blocked
// (in-app browsers, strict popup blockers) so the click is never dead.
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href*="wa.me"]');
  if (!link) return;
  const href = link.href;
  e.preventDefault();
  const win = window.open(href, '_blank', 'noopener');
  if (!win) window.location.href = href;
});

// Split heading text into per-word spans for staggered reveal
(function () {
  if (reduceMotion) return;
  document.querySelectorAll('[data-split]').forEach((el) => {
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((tok) => {
            if (tok.trim() === '') { frag.appendChild(document.createTextNode(tok)); return; }
            const span = document.createElement('span');
            span.className = 'word';
            span.textContent = tok;
            frag.appendChild(span);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && !child.classList.contains('word')) {
          walk(child);
        }
      });
    };
    walk(el);
    el.querySelectorAll('.word').forEach((w, i) => {
      w.style.setProperty('--word-delay', i * 55 + 'ms');
    });
  });
})();

// Scroll-reveal: fade + rise on entry (with stagger for grid children)
(function () {
  const els = document.querySelectorAll('[data-reveal], [data-split]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  // stagger siblings that share a parent marked data-stagger
  document.querySelectorAll('[data-stagger]').forEach((group) => {
    [...group.querySelectorAll('[data-reveal]')].forEach((el, i) => {
      el.style.setProperty('--reveal-delay', i * 90 + 'ms');
    });
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach((el) => io.observe(el));
})();

// Scroll progress bar
(function () {
  const bar = document.querySelector('.scroll-progress');
  if (!bar) return;
  let ticking = false;
  const update = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const p = max > 0 ? h.scrollTop / max : 0;
    bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  update();
})();

// Timeline rail fill (process section)
(function () {
  const rail = document.querySelector('.timeline-rail');
  if (!rail || reduceMotion) return;
  const section = rail.closest('section') || rail.parentElement;
  let ticking = false;
  const update = () => {
    const r = section.getBoundingClientRect();
    const vh = window.innerHeight;
    const total = r.height + vh * 0.5;
    const p = Math.min(Math.max((vh - r.top) / total, 0), 1);
    rail.style.setProperty('--rail', (p * 100).toFixed(1) + '%');
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
})();

// Parallax on marked elements
(function () {
  const items = [...document.querySelectorAll('[data-parallax]')];
  if (!items.length || reduceMotion) return;
  let ticking = false;
  const update = () => {
    const vh = window.innerHeight;
    items.forEach((el) => {
      const speed = parseFloat(el.dataset.parallax) || 0.15;
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const offset = (center - vh / 2) * speed;
      el.style.transform = 'translate3d(0,' + (-offset).toFixed(1) + 'px,0)';
    });
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
})();

// 3D tilt on cards (pointer-fine only)
(function () {
  if (!finePointer || reduceMotion) return;
  document.querySelectorAll('[data-tilt]').forEach((card) => {
    const max = 8;
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.transform =
        'perspective(900px) rotateY(' + ((px - 0.5) * max * 2).toFixed(2) + 'deg) rotateX(' +
        ((0.5 - py) * max * 2).toFixed(2) + 'deg) translateY(-4px)';
      card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
    });
  });
})();

// Magnetic buttons (pointer-fine only)
(function () {
  if (!finePointer || reduceMotion) return;
  document.querySelectorAll('[data-magnetic]').forEach((btn) => {
    const strength = 0.3;
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) * strength;
      const y = (e.clientY - (r.top + r.height / 2)) * strength;
      btn.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    });
    btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
  });
})();

// Custom cursor (pointer-fine only)
(function () {
  if (!finePointer || reduceMotion) return;
  const dot = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');
  if (!dot || !ring) return;
  document.body.classList.add('has-cursor');
  let mx = 0, my = 0, rx = 0, ry = 0;
  window.addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = 'translate(' + mx + 'px,' + my + 'px) translate(-50%,-50%)';
  }, { passive: true });
  const loop = () => {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.transform = 'translate(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px) translate(-50%,-50%)';
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  document.addEventListener('pointerover', (e) => {
    if (e.target.closest('a, button, [data-tilt], summary, input, textarea')) ring.classList.add('is-hover');
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest('a, button, [data-tilt], summary, input, textarea')) ring.classList.remove('is-hover');
  });
})();

// Stat counters: count up once revealed
(function () {
  const stats = document.querySelectorAll('[data-count]');
  if (!stats.length) return;
  const animate = (el) => {
    const target = parseInt(el.dataset.count, 10);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const dur = 1200;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (reduceMotion || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animate(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  stats.forEach((el) => io.observe(el));
})();

// Mobile nav: toggle, Escape, focus trap
(function () {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (!toggle || !links) return;

  const labels = { open: toggle.getAttribute('aria-label'), close: toggle.dataset.closeLabel || 'إغلاق القائمة' };

  const setOpen = (open) => {
    links.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? labels.close : labels.open);
  };

  toggle.addEventListener('click', () => setOpen(!links.classList.contains('open')));

  links.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (!links.classList.contains('open')) return;
    if (e.key === 'Escape') {
      setOpen(false);
      toggle.focus();
      return;
    }
    if (e.key === 'Tab') {
      const items = [toggle, ...links.querySelectorAll('a')];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
})();

// Scroll-spy: highlight active nav link
(function () {
  const spyLinks = document.querySelectorAll('[data-spy]');
  if (!spyLinks.length || !('IntersectionObserver' in window)) return;
  const map = {};
  spyLinks.forEach((a) => { map[a.dataset.spy] = a; });
  const sections = Object.keys(map)
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        spyLinks.forEach((a) => a.classList.remove('active'));
        map[entry.target.id].classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach((s) => io.observe(s));
})();

// Back to top
(function () {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  const onScroll = () => { btn.hidden = window.scrollY < 700; };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' });
  });
})();

// Auto year
(function () {
  const el = document.getElementById('year');
  if (el) el.textContent = new Date().getFullYear();
})();

// Contact form: AJAX submit via FormSubmit, mailto fallback on failure
(function () {
  const form = document.getElementById('contactForm');
  if (!form) return;
  const status = document.getElementById('formStatus');
  const button = form.querySelector('button[type="submit"]');
  const isEn = document.documentElement.lang === 'en';
  const msgs = {
    sending: isEn ? 'Sending…' : 'جارٍ الإرسال…',
    invalid: isEn ? 'Please fill in all fields with a valid email.' : 'رجاءً أكملوا جميع الحقول ببريد إلكتروني صحيح.',
    ok: isEn ? 'Thank you! We received your message and will reply within one business day.' : 'شكرًا لكم! وصلتنا رسالتكم وسنرد خلال يوم عمل واحد.',
    fail: isEn
      ? 'Sending failed — email us directly at contact.us@reidpro.com'
      : 'تعذّر الإرسال — راسلونا مباشرة على contact.us@reidpro.com',
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.classList.remove('error');

    if (!form.checkValidity()) {
      status.textContent = msgs.invalid;
      status.classList.add('error');
      form.reportValidity();
      return;
    }

    const data = new FormData(form);
    if (data.get('_honey')) return; // bot
    data.append('_subject', 'رسالة جديدة من موقع رِيْد');
    data.append('_template', 'table');

    button.disabled = true;
    status.textContent = msgs.sending;

    try {
      const res = await fetch('https://formsubmit.co/ajax/contact.us@reidpro.com', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: data,
      });
      if (!res.ok) throw new Error('http ' + res.status);
      form.reset();
      status.textContent = msgs.ok;
      track('form-success');
    } catch (err) {
      status.textContent = msgs.fail;
      status.classList.add('error');
      const subject = encodeURIComponent('استفسار من موقع رِيْد');
      const body = encodeURIComponent(`${data.get('name')}\n${data.get('email')}\n\n${data.get('message')}`);
      window.open(`mailto:contact.us@reidpro.com?subject=${subject}&body=${body}`, '_self');
    } finally {
      button.disabled = false;
    }
  });
})();
