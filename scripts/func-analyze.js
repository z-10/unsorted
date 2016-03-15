#!/usr/bin/env node
var fs = require("fs"),
    esprima = require("esprima"),
    program = require('commander'),
    funcArr = [];


function saveNode(name, node)
{
    var size = node.body.range[1] - node.body.range[0];
    if (size > 599)
    {
        funcArr.push({
            name: name,
            line: node.loc.start.line,
            column: node.loc.start.column,
            size: size
        });
    }
}


function traverseTree(object, callback, top)
{
    var parent;
    parent = (top === 'undefined') ? [] : top;
    if (callback.call(null, object, parent) === false)
    {
        return;
    }
    return Object.keys(object).forEach(function (key)
    {
        var child, path;
        child = object[key];
        path = [object];
        path.push(parent);
        if (typeof child === 'object' && child !== null)
        {
            return traverseTree(child, callback, path);
        }
    });
}

//function assignment variants
function processAssignment(node, parent)
{
    var found = false,
        name;
    if (typeof parent.left.range !== 'undefined')
    {
        if (parent.left.type === "MemberExpression")
        {
            // foo.myFunc = function
            if (parent.left.object.name !== undefined)
            {
                if (parent.left.property.name !== undefined)
                {
                    name = parent.left.property.name;
                    found = true;
                }

                //foo['myFunc'] = function()
                else if (parent.left.property && parent.left.property.type === "Literal")
                {
                    name = parent.left.property.value;
                    found = true;
                }
            }
            //this.myFunc = function
            else if (parent.left.object.type === "ThisExpression")
            {
                if (parent.left.property.name !== undefined)
                {
                    name = parent.left.property.name;
                    found = true;
                }
                //this['myFunc'] = function()
                else if (parent.left.property.type === "CallExpression")
                {
                    found = true;
                }
            }
            // Something.prototype.myFunc = function()
            else if (parent.left.object.object !== undefined && parent.left.object.object.type === "Identifier")
            {
                name = parent.left.property.name;
                found = true;
            }

            // this.elem.myFunc = function()
            else if (parent.left.type === "MemberExpression" && parent.left.object.type === "MemberExpression")
            {
                name = parent.left.property.name;
                found = true;
            }

            // exotic (bool expression ? obj1 : obj2).doSomething = function()
            else if (parent.left.object !== undefined && parent.left.object.type === "ConditionalExpression")
            {
                found = true;
            }
        }
        else if (parent.left.type === "Identifier")
        {
            name = parent.left.name;
            found = true;
        }
    }
    if (found)
    {
        saveNode(name, node);
    }
    return found;
}


function processNode(node, path)
{
    var parent;

    if (node.type === 'FunctionDeclaration')
    {
        // simple function
        saveNode(node.name, node);
        return true;
    }
    else if (node.type === 'FunctionExpression')
    {
        //things are trickier here
        parent = path[0];
        if (parent.type === 'AssignmentExpression')
        {
            return processAssignment(node, parent);
        } else if (parent.type === 'VariableDeclarator')
        {
            saveNode(parent.id.name, node);
            return true;
        } else if (parent.type === 'CallExpression')
        {
            saveNode(parent.id ? parent.id.name : '[Anonymous]', node);
            return true;
        } else if (typeof parent.length === 'number')
        {
            saveNode(parent.id ? parent.id.name : '[Anonymous]', node);
            return true;
        } else if (typeof parent.key !== 'undefined')
        {
            if (parent.key.type === 'Identifier')
            {
                if (parent.value === node && parent.key.name)
                {
                    saveNode(parent.key.name, node);
                    return true;
                }
            }
        }
    }
}

function getAllFunctions(tree)
{
    traverseTree(tree, processNode);
}

function outputHTML()
{
    var html = "<html><head><title>Function length analysis</title></head><body><table>";
    html = html + '<tr><td>Function</td><td>Line</td><td>Column</td><td>Size</td></tr>';
    funcArr.forEach(function (rep)
    {
        html = html + '<tr><td>' + rep.name + '</td><td>' + rep.line + '</td><td>' + rep.column + '</td><td>' + rep.size + '</td></tr>';
    });
    html = html + "</table></body></html>";

    return html;
}

function outputJSON()
{
    return JSON.stringify(funcArr);
}

function processFile(fileName)
{
    var source = fs.readFileSync(process.cwd() + "/" + fileName, "utf8"),
        tree = esprima.parse(source, {
            loc: true,
            range: true
        });
    getAllFunctions(tree);
    if (funcArr.length > 0)
    {
        funcArr.sort(function (b, a)
        {
            if (a.size < b.size)
                return -1;
            else if (a.size > b.size)
                return 1;
            else
                return 0;
        });
    }
}

function saveFile(data, fileName)
{
    fs.writeFile(fileName, data, function (err)
    {
        if (err)
        {
            console.log(err);
        } else
        {
            console.log("report saved to " + fileName);
        }
    });
}

program
    .version('0.0.1')
    .option('-i, --input <file>', 'File to parse')
    .option('-o, --output <file>', 'Output file')
    .option('-h, --html', 'Output ugly HTML')
    .parse(process.argv);

if(!program.input) {
    console.log("Usage : func-analyze.js -i <filename>");
} else
{
    processFile(program.input);
    var result = program.html ? outputHTML() : outputJSON();
    if(program.output) {
        saveFile(result, program.output);
    } else {
        console.log(result);
    }


}