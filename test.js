var assert = require('assert');
var Xvfb = require('./index.js');

var xvfb = new Xvfb({ displayNum: 88 });

xvfb.startSync();
console.error('started sync');
xvfb.stopSync();
console.error('stopped sync');
xvfb.start(function(err) {
    assert.equal(err, null);
    console.error('started async');
    xvfb.stop(function(err) {
        assert.equal(err, null);
        console.error('stopped async');
        xvfb.start(function(err) {
            assert.equal(err, null);
            console.error('started async');
            xvfb.stopSync();
            console.error('stopped sync');
            xvfb.startSync();
            console.error('started sync');
            xvfb.stop(function(err) {
                assert.equal(err, null);
                console.error('stopped async');
            });
        });
    });
});