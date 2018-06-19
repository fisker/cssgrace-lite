var postcss = require('postcss')

var reRGBA = /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([\d\.]+\s*)/gi
var reALL_PSEUDO = /::(before|after|first-line|first-letter)/gi
var reBLANK_LINE = /(\r\n|\n|\r)(\s*?\1)+/gi

/**
 * 删除多余的 display: block
 * 当存在 float: left|right & position: absolute|fixed 时无需写 display: block;
 */
var removeDisplay = function(decl) {
  if (
    (decl.prop == 'position' &&
      (decl.value == 'absolute' || decl.value == 'fixed')) ||
    (decl.prop == 'float' && decl.value != 'none')
  ) {
    // 不存在 display: none 时删掉 display
    decl.parent.each(function(neighbor) {
      if (
        neighbor.prop == 'display' &&
        (neighbor.value == 'block' || neighbor.value == 'inline-block')
      ) {
        //存在时删掉它
        neighbor.remove()
      }
    })
  }
}

/**
 * 删除多余的 float
 * 当存在 position: absolute|fixed, display: flex 时删除多余的 float
 */
var removeFloat = function(decl) {
  if (
    decl.prop == 'position' &&
    (decl.value == 'absolute' || decl.value == 'fixed')
  ) {
    decl.parent.each(function(neighbor) {
      if (neighbor.prop == 'float' && neighbor.prop != 'none') {
        neighbor.remove()
      }
    })
  }
}

//伪元素只保留一个冒号
var removeColons = function(rule, i) {
  if (rule.selector.match(reALL_PSEUDO)) {
    rule.selector = rule.selector.replace(/::/g, ':')
  }
}

/**
 * resize mixin
 * resize 只有在 overflow 不为 visible 时生效
 */
function resizeMixin(decl, i) {
  if (decl.prop == 'resize' && decl.value !== 'none') {
    var count = 0
    decl.parent.walkDecls(function(decl) {
      if (decl.prop == 'overflow') count++
    })
    if (count === 0) {
      var reBefore = decl.raws.before.replace(reBLANK_LINE, '$1')

      insertDecl(decl, i, {
        raws: {
          before: reBefore
        },
        prop: 'overflow',
        value: 'auto'
      })
    }
  }
}

/**
 * IE opacity hack
 * 转换为 IE filter
 */
function ieOpacityHack(decl, i) {
  //四舍五入
  var amount = Math.round(decl.value * 100)
  if (decl.prop == 'opacity') {
    var reBefore = decl.raws.before.replace(reBLANK_LINE, '$1')

    insertDecl(decl, i, {
      raws: {
        before: reBefore
      },
      prop: 'filter',
      value: 'alpha(opacity=' + amount + ')'
    })
  }
}

/**
 * IE rgba hack
 * background rgba 转换为 IE ARGB
 */
function ieRgbaHack(decl, i) {
  //十六进制不足两位自动补 0
  function pad(str) {
    return str.length == 1 ? '0' + str : '' + str
  }
  if (
    (decl.prop == 'background' || decl.prop == 'background-color') &&
    decl.value.match(reRGBA)
  ) {
    // rgba 转换为 AARRGGBB
    var colorR = pad(parseInt(RegExp.$1).toString(16))
    var colorG = pad(parseInt(RegExp.$2).toString(16))
    var colorB = pad(parseInt(RegExp.$3).toString(16))
    var colorA = pad(parseInt(RegExp.$4 * 255).toString(16))
    var ARGB = "'" + '#' + colorA + colorR + colorG + colorB + "'"

    // 插入IE半透明滤镜
    var reBefore = decl.raws.before.replace(reBLANK_LINE, '$1')
    insertDecl(decl, i, {
      raws: {
        before: reBefore
      },
      prop: 'filter',
      value:
        'progid:DXImageTransform.Microsoft.gradient(startColorstr=' +
        ARGB +
        ', endColorstr=' +
        ARGB +
        ')'
    })

    // IE9 rgba 和滤镜都支持，插入 :root hack 去掉滤镜
    var newSelector = ':root ' + decl.parent.selector

    var nextrule = postcss.rule({
      selector: newSelector
    })
    decl.parent.parent.insertAfter(decl.parent, nextrule)
    nextrule.append({
      prop: 'filter',
      value: 'none\\9'
    })
  }
}

// IE inline-block hack
function ieInlineBlockHack(decl, i) {
  if (decl.prop == 'display' && decl.value == 'inline-block') {
    var reBefore = decl.raws.before.replace(reBLANK_LINE, '$1')

    insertDecl(decl, i, {
      raws: {
        before: reBefore
      },
      prop: '*zoom',
      value: 1
    })
    insertDecl(decl, i, {
      raws: {
        before: reBefore
      },
      prop: '*display',
      value: 'inline'
    })
  }
}

//在后面插入新的属性，并保持注释在当前行
function insertDecl(decl, i, newDecl) {
  var next = decl.next()
  var declAfter
  if (
    next &&
    next.type === 'comment' &&
    next.raws.before.indexOf('\n') === -1
  ) {
    declAfter = next
  } else {
    declAfter = decl
  }
  declAfter.after(newDecl)
}

var cssgraceRule = function(rule, i) {
  //遍历 selectors
  removeColons(rule, i)

  //遍历 decl
  rule.walkDecls(function(decl, i) {
    removeDisplay(decl, i)
    ieInlineBlockHack(decl, i)
    ieOpacityHack(decl, i)
    ieRgbaHack(decl, i)
    resizeMixin(decl, i)
  })

  rule.walkDecls(function(decl, i) {
    removeFloat(decl, i)
    removeDisplay(decl, i)
  })
}

// PostCSS Processor
var cssprocess = function(css) {
  css.walkRules(cssgraceRule)
}

var pack = function(css, opts) {
  return postcss(cssprocess).process(css, opts).css
}

exports.postcss = cssprocess
exports.pack = pack
