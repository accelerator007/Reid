//gygj
// Reid — رِيْد

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Analytics helper: no-ops until Plausible (or similar) is enabled
function track(name) {
  if (window.plausible) window.plausible(name);
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-track]');
  if (el) track(el.dataset.track);
});

// Scroll-reveal: fade + rise on entry
(function () {
  const els = document.querySelectorAll('[data-reveal]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
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
