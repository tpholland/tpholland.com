var margin = {top: 350, right: 480, bottom: 350, left: 480},
    radius = Math.min(margin.top, margin.right, margin.bottom, margin.left) - 10;

var hue = d3.scale.category20();

var luminance = d3.scale.sqrt()
    .domain([0, 1e6])
    .clamp(true)
    .range([90, 20]);

var svg = d3.select("#wheel").append("svg")
    .attr("width", margin.left + margin.right)
    .attr("height", margin.top + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

var partition = d3.layout.partition()
    .sort(function(a, b) { return d3.ascending(a.name, b.name); })
    .size([2 * Math.PI, radius]);

var arc = d3.svg.arc()
    .startAngle(function(d) { return d.x; })
    .endAngle(function(d) { return d.x + d.dx - .01 / (d.depth + .5); })
    .innerRadius(function(d) { 
        return radius / 5 * ((d.depth * 3) - 2); 
    })
    .outerRadius(function(d) { 
        return radius / 5 * (d.depth + 3); 
    });

d3.json("nsan-map.json", function(error, root) {

  // Compute the initial layout on the entire tree to sum sizes.
  // Also compute the full name and fill color for each node,
  // and stash the children so they can be restored as we descend.
  partition
      .nodes(root)
      .forEach(function(d) {
        d._children = d.children;
        d.sum = 1;
        if (d.depth > 1) d.sum = 1 / Object.keys(d.parent.children).length; 
        d.label = d.name;
        d.key = key(d);
        d.fill = fill(d);
      });

  // Now redefine the value function to use the previously-computed sum.
  partition
      .children(function(d, depth) { return depth < 2 ? d._children : null; })
      .value(function(d) { return d.sum; });

  var center = svg.append("circle")
      .attr("r", radius / 5)
      .on("click", zoomOut);

  center.append("title")
      .text("zoom out");

  var path = svg.selectAll("path")
      .data(partition.nodes(root).slice(1))
    .enter().append("path")
      .attr("d", arc)
      .style("fill", function(d) { return d.fill; })
      .style("fill-opacity", function(d) { return 1 / d.depth;})
      .each(function(d) { this._current = updateArc(d); })
      .on("mouseover", update_legend)
      .on("mouseout", remove_legend)
      .on("click", zoomIn);

  var labels = svg.selectAll("text.label")
      .data(partition.nodes(root).filter(function(d) {return d.depth == 1;}))
    .enter().append("text")
      .attr("class", "label")
      .style("fill", "black")
      .style("text-anchor", "middle")
      .attr("transform", function(d) { 
          return "translate(" + arc.centroid(d) + ")"; 
      })
      .on("click", zoomIn)
      .text(function(d, i) { return d.label;} );

  function zoomIn(p) {
    if (p.depth > 1) p = p.parent;
    if (!p.children) return;
    svg.selectAll("text.label").data([]).exit().remove()
    zoom(p, p);
  }

  function zoomOut(p) {
    if (!p.parent) return;
    svg.selectAll("text.label").data([]).exit().remove()
    zoom(p.parent, p);
  }

  // Zoom to the specified new root.
  function zoom(root, p) {
    if (document.documentElement.__transition__) return;

    // Rescale outside angles to match the new layout.
    var enterArc,
        exitArc,
        outsideAngle = d3.scale.linear().domain([0, 2 * Math.PI]);

    function insideArc(d) {
      return p.key > d.key
          ? {depth: d.depth - 1, x: 0, dx: 0} : p.key < d.key
          ? {depth: d.depth - 1, x: 2 * Math.PI, dx: 0}
          : {depth: 0, x: 0, dx: 2 * Math.PI};
    }

    function outsideArc(d) {
      return {depth: d.depth, x: outsideAngle(d.x), dx: outsideAngle(d.x + d.dx) - outsideAngle(d.x)};
    }

    center.datum(root);

    // When zooming in, arcs enter from the outside and exit to the inside.
    // Entering outside arcs start from the old layout.
    if (root === p) enterArc = outsideArc, exitArc = insideArc, outsideAngle.range([p.x, p.x + p.dx]);

    path = path.data(partition.nodes(root).slice(1), function(d) { return d.key; });

    // When zooming out, arcs enter from the inside and exit to the outside.
    // Exiting outside arcs transition to the new layout.
    if (root !== p) enterArc = insideArc, exitArc = outsideArc, outsideAngle.range([p.x, p.x + p.dx]);

    d3.transition().duration(d3.event.altKey ? 7500 : 750).each(function() {
      path.exit().transition()
          .style("fill-opacity", function(d) { return d.depth === 1 + (root === p) ? 1 : 0; })
          .attrTween("d", function(d) { return arcTween.call(this, exitArc(d)); })
          .remove();

      path.enter().append("path")
          .style("fill-opacity", function(d) { return d.depth === 2 - (root === p) ? 1 : 0; })
          .style("fill", function(d) { return d.fill; })
          .on("click", zoomIn)
          .on("mouseover",update_legend)
          .on("mouseout",remove_legend)          
          .each(function(d) { this._current = enterArc(d); });

      path.transition()
          .style("fill-opacity", function(d) { return 1 / d.depth;})
          .attrTween("d", function(d) { return arcTween.call(this, updateArc(d)); });
    
    labels = labels.data(partition.nodes(root).filter(function(d) {return d.depth == 1;}), function(d) { return d.key; });

      labels.enter().append("text")
      .attr("class", "label")
      .attr("class", "label")
      .style("opacity", 0)
      .style("fill", "black")
      .style("text-anchor", "middle")
      .attr("transform", function(d) { 
          return "translate(" + arc.centroid(d) + ")"; 
      })
      .on("click", zoomIn)
      .text(function(d, i) { return d.label.replace(/.{10}\S*\s+/g, "$&@").split(/\s+@/)[0];} );
      labels.append("tspan")
      .attr("x", 0)
      .attr("dy", "1em")
      .text(function(d, i) { return d.label.replace(/.{10}\S*\s+/g, "$&@").split(/\s+@/)[1];} );
      labels.append("tspan")
      .attr("x", 0)
      .attr("dy", "1em")
      .text(function(d, i) { return d.label.replace(/.{10}\S*\s+/g, "$&@").split(/\s+@/)[2];} );
      labels.transition().duration(1000).style("opacity", 1);
    });
  }
});

function key(d) {
  var k = [], p = d;
  while (p.depth) k.push(p.name), p = p.parent;
  return k.reverse().join(".");
}

function fill(d) {
  var p = d;
  while (p.depth > 1) p = p.parent;
  var c = d3.lab(hue(p.name));
  c.l = luminance(d.sum);
  return c;
}

function arcTween(b) {
  var i = d3.interpolate(this._current, b);
  this._current = i(0);
  return function(t) {
    return arc(i(t));
  };
}

function updateArc(d) {
  return {depth: d.depth, x: d.x, dx: d.dx};
}

var legend = d3.select("#legend");

function weighting(d) {
    return 1 / Object.keys(d.parent.children).length;
}

function update_legend(d)
    {
     legend.html("<h2>"+ innerRadius(d) + "&nbsp;" + outerRadius(d) +"</h2>")
        legend.transition().duration(200).style("opacity","1");
// legend.attr("display", function(d) { return (d.type == "holder" ? "none" : null); }); // hide text from holder elements
    }

    function remove_legend(d)
    {
        legend.transition().duration(1000).style("opacity","0");
// legend.html("<h2>&nbsp;</h2>")
    }

d3.select(self.frameElement).style("height", margin.top + margin.bottom + "px");
