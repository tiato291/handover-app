'use strict';

module.exports = function handler(req, res) {
  res.setHeader('Set-Cookie', 'gm_session=; HttpOnly; Path=/; Max-Age=0');
  res.status(200).json({ ok: true });
};
