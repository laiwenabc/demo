/**
 * webpack 配置文件
 */

// 全局变量
var nodeEnv = process.env.nodeEnv;
var zipName = process.env.zipName;
var publicPath = process.env.publicPath;

var configs = require('../configs');
var utils = require('./utils');
var webpack = require('webpack');
var prodConfig = configs.getConfigs();
var devBabel = prodConfig['babel'];
var actNames = configs.getActNames();


// 复制文件
var TransferWebpackPlugin = require('transfer-webpack-plugin');
// 独立打包文件
var ExtractTextPlugin = require('extract-text-webpack-plugin');

/**
 * 获取配置文件
 * @param buildFile 所有的入口文件地址
 * @param staticRoutes 静态文件路径 ../img  ../fonts  ../mock  ../media
 */
exports.getConfigs = function(buildFile, staticRoutes) {
    // 获取活动入口文件
    var entryMap = getEntryMap(buildFile.scripts);

    if (nodeEnv == 'dev') {
        return getDev(entryMap);
    } else {
        return getProd(entryMap, staticRoutes, buildFile.htmls);
    }
};


// ===== 公用配置 =====

// 入口文件配置
var resolveConfig = {
    // 入口根文件夹
    root: configs.path.app,
    // 默认文件后缀
    extensions: ['', '.js', '.scss', '.css', '.html'],
    alias: {
      'components': configs.path.components + '/'
    } 
};

// 加载器配置
var moduleConfig = {
    loaders: [{
        test: /\.temp$/,
        exclude: /(node_modules|bower_components)/,
        loader: 'html-loader'
    }, {
        test: /(.*)temps(.*)\.(njk|tpl)$/,
        exclude: /(node_modules|bower_components)/,
        loader: 'nunjucks-loader'
    }, {
        test: /(.*)components(.*)\.(png|jpg|gif|jpeg)$/,
        exclude: /(node_modules|bower_components)/,
        loader: 'font-image-loader?remove=app/&limit=5120&name=[path][name].[ext]?[hash:8]'
    }, {
        test: /\.(eot|svg|ttf|woff|png|jpg|gif|jpeg)$/,
        exclude: /(node_modules|bower_components)/,
        loader: 'font-image-loader?emitFile=0&remove=app/&limit=5120&name=[path][name].[ext]?[hash:8]'
    }]
};

// 环境变量插件
var pluginsEnv = new webpack.DefinePlugin({
    'process.env': {
        NODE_ENV: '"' + nodeEnv + '"',
        NAME: '"' + utils.getSystem() + '"',
        HYPER: '"' + prodConfig.hyper[nodeEnv] + '"',
        PUBLICPATH: '"' + (nodeEnv == 'dev' ? '/' : publicPath) + '"'
    }
});

// ===== 公用配置 =====


/**
 * 获取非开发环境配置
 * @param entryMap 入口文件
 * @param staticRoutes 静态文件路径
 * @param htmls 所有页面
 */
function getProd(entryMap, staticRoutes, htmls) {

    // 所需插件
    // var pluginsCss = new ExtractTextPlugin(configs.path.sassPathDic + '/[name].[chunkhash:8].css');
    var pluginsCss = new ExtractTextPlugin('[name].[chunkhash:8].css');
    var needPlugins = [pluginsCss, pluginsEnv];

    // 文件拷贝
    var ismock = prodConfig.ismock[nodeEnv];
    for (var key in staticRoutes) {
        // 是否需要 mock 数据
        if (!ismock && /\/mock$/.test(staticRoutes[key])) {
            continue;
        }
        // 图片由图片压缩工具来处理
        if (/\/img$/.test(staticRoutes[key])) {
            continue;
        }
        needPlugins.push(new TransferWebpackPlugin([{
            from: '.' + staticRoutes[key],
            to: './' + staticRoutes[key]
        }], configs.path.app));
    }

    needPlugins.push(new TransferWebpackPlugin([{
        from: configs.path.lib.from,
        to: configs.path.lib.to
    }], configs.path.app));

    // 是否压缩
    if (prodConfig.ismin[nodeEnv]) {
        // 压缩脚本
        var uglifyPlug = new webpack.optimize.UglifyJsPlugin({
            compress: {
                warnings: false,
                drop_console: nodeEnv == 'production'
            },
            output: {
                comments: false
            }
        });
        needPlugins.push(uglifyPlug);
        // 压缩样式
        pluginsCss = pluginsCss.extract(['css?minimize', 'sass?sourceMap']);
    } else {
        pluginsCss = pluginsCss.extract(['css', 'sass?sourceMap']);
    }

    // 打包 html 文件，遍历文件
    var pageDatas = {};
    var htmlPathDic = '/' + configs.path.htmlPathDic;
    Array.from(htmls, (page) => {
        if (page.indexOf(htmlPathDic) >= 0) {
            var idx = page.indexOf(htmlPathDic);
            var act = page.substr(1, idx - 1);
            var key = page.substr(idx + 6);

            if (pageDatas[act] == null) {
                pageDatas[act] = {};
            }

            var slugKey = act + '/js/' + key.replace(/\.html$/, '');
            var slug = slugKey + '.js';
            var clazz = slugKey + '.css';

            // pageDatas[act][configs.path.htmlPathDic + '/' + key] = {
            pageDatas[act][configs.path.app + page] = {
                root: process.env.publicPath,
                vendor: '##entry.' + act + '/js/vendor.js##',
                slug: '##entry.' + slug + '##',
                clazz: '##entry.' + clazz + '##'
            };
        }
    });

    // 遍历打包所有 html 文件
    var MutiHtmlWebpackPlugin = require('muti-html-webpack-plugin');
    for (var key in actNames) {
        var datas = pageDatas[actNames[key].substr(actNames[key].lastIndexOf('/') + 1)];

        needPlugins.push(new MutiHtmlWebpackPlugin({
            templatePath: actNames[key] + htmlPathDic,
            loader: 'html?attrs=img:src img:data-src!compile-nunjucks?data=' + JSON.stringify(datas),
            templateSuffix: '.html',
            path: actNames[key].substr(actNames[key].lastIndexOf('/')) + htmlPathDic
        }));
    }


    // loader 解析
    var modules = moduleConfig;
    modules.loaders.push({
        test: /\.js$/,
        loader: 'babel',
        exclude: /(node_modules|bower_components)/,
        query: {
            presets: ['es2015', 'stage-0']
        }
    });
    modules.loaders.push({
        test: /\.scss$/,
        exclude: /(node_modules|bower_components)/,
        loader: pluginsCss
    });

    return {
        // 插件
        plugins: needPlugins,

        // 脚本入口文件配置，必须配置了该项或者 resolve 别名， script src 才能引用
        entry: entryMap,

        // 打包后，脚本文件输出配置
        output: {
            filename: '[name].[chunkhash:8].js',
            chunkFilename: configs.path.ensurePathDic + '/[name].[chunkhash:8].js',
            path: configs.path.dist,
            publicPath: publicPath
        },

        // 入口文件查询
        resolve: resolveConfig,

        //加载器配置
        module: modules
    };
};
/**
 * 获取开发环境配置
 * @param entryMap 入口脚本文件
 */
function getDev(entryMap) {
    var modules = moduleConfig;
    modules.loaders.push({
        test: /\.scss$/,
        exclude: /(node_modules|bower_components)/,
        loader: 'style!css!sass?sourceMap'
    });
    modules.loaders.push({
        test: /\.js$/,
        loader: 'babel',
        exclude: /(node_modules|bower_components)/,
        query: {
            presets: ['es2015', 'stage-0']
        }
    });

    if (devBabel) {
        modules.loaders.push({
            test: /\.js$/,
            loader: 'babel',
            exclude: /(node_modules|bower_components)/,
            query: {
                presets: ['es2015', 'stage-0']
            }
        });
    }

    return {
        // 插件
        plugins: [
            new webpack.HotModuleReplacementPlugin(),
            pluginsEnv
        ],

        // 脚本入口文件配置，必须配置了该项或者 resolve 别名， script src 才能引用
        entry: entryMap,

        // 打包后，脚本文件输出配置
        output: {
            filename: '[name].js',
            path: '/dist',
            publicPath: '/'
        },

        // 入口文件查询
        resolve: resolveConfig,

        //加载器配置
        module: modules
    };

};

/**
 * 获取入口文件
 * @param scripts 所有的入口文件地址
 */
function getEntryMap(scripts) {
    var result = {};
    for (var key in scripts) {
        var entry = scripts[key].substr(1).replace(/\.js$/, '');
        result[entry] = [configs.path.app + scripts[key]];
        if (nodeEnv == 'dev') {
            result[entry].push('webpack-hot-middleware/client?reload=true');
        }
    }
    return result;
};
